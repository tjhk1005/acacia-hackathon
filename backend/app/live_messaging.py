"""WhatsApp linking, signed inbound evidence, durable outbox and bounded automation."""
import asyncio
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import uuid4
from urllib.parse import parse_qs

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import PlainTextResponse, Response
from pydantic import Field, field_validator

from .coordinator import load_coordination, prepare_drafts, save_coordination
from .models import Model, VendorReplyAnalysis, WeddingBrief
from .planning import missing_fields
from .whatsapp_transport import WhatsAppSettings, WhatsAppTransport, TransportError, availability_text
from .twilio_transport import TwilioSettings, TwilioTransport, valid_signature


def clock():
    return datetime.now(timezone.utc)


def stamp(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


FOOTER = 'Automated planning enquiry; no booking authorised. Reply STOP to stop or HUMAN to reach the couple.'
QUESTIONS = {
    'itemised_quote': 'Could you share an itemised quote in SGD, including taxes, service charges, minimum order, inclusions, exclusions and quote expiry?',
    'menu_options': 'Could you share your menu options, dietary adaptations and any additional charges?',
    'setup_requirements': 'Could you share your setup and teardown times, access requirements and any venue requirements or extra charges?',
}


class ConnectionChange(Model):
    expected_revision: int = Field(ge=0)
    brief_revision: int = Field(ge=0)
    recipient: str = Field(max_length=16)
    mode: Literal['off', 'review', 'automatic']
    opt_in: bool = False
    consent_note: str = Field(default='', max_length=500)

    @field_validator('recipient')
    @classmethod
    def valid_recipient(cls, value):
        if not re.fullmatch(r'\+[1-9][0-9]{7,14}', value):
            raise ValueError('Use an individual phone number with country code, for example +6581234567')
        return value[1:]


class SendApproval(Model):
    brief_revision: int = Field(ge=0)
    binding_revision: int = Field(ge=1)
    expected_content: str = Field(min_length=1, max_length=4096)


class ManualDraft(Model):
    brief_revision: int = Field(ge=0)
    content: str = Field(min_length=1, max_length=3500)


class LiveMessaging:
    def __init__(self, store, agent=None, settings=None, transport=None):
        self.store, self.agent = store, agent
        # Pilot releases must never activate network messaging just because keys exist.
        self.piloting = os.getenv('WHATSAPP_PILOTING', 'true').lower() not in {'0', 'false'}
        self.settings = settings or (WhatsAppSettings.from_env() if os.getenv('WHATSAPP_PROVIDER', 'twilio') == 'meta' else TwilioSettings.from_env())
        transport_type = TwilioTransport if self.settings.provider == 'twilio' else WhatsAppTransport
        self.transport = transport or (transport_type(self.settings) if self.settings.configured and not self.piloting else None)
        self.owner = str(uuid4())
        self.task = None
        self.identity = None
        self.last_error = ''
        with store.connection() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS live_bindings (
                    wedding_id TEXT NOT NULL REFERENCES weddings(id), vendor_id TEXT NOT NULL,
                    account_id TEXT NOT NULL, recipient TEXT NOT NULL, revision INTEGER NOT NULL,
                    mode TEXT NOT NULL, opt_in INTEGER NOT NULL, consent_note TEXT NOT NULL,
                    consent_revision INTEGER NOT NULL, last_inbound_at TEXT, stopped INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY(wedding_id,vendor_id), UNIQUE(account_id,recipient)
                );
                CREATE TABLE IF NOT EXISTS live_outbox (
                    message_id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL REFERENCES weddings(id), vendor_id TEXT NOT NULL,
                    binding_revision INTEGER NOT NULL, brief_revision INTEGER NOT NULL, content TEXT NOT NULL,
                    automatic INTEGER NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
                    provider_id TEXT UNIQUE, error TEXT NOT NULL DEFAULT '', next_attempt_at TEXT NOT NULL,
                    claimed_at TEXT, created_at TEXT NOT NULL,
                    account_id TEXT NOT NULL DEFAULT '', recipient TEXT NOT NULL DEFAULT ''
                );
                CREATE INDEX IF NOT EXISTS live_outbox_queue ON live_outbox(status,next_attempt_at);
                CREATE TABLE IF NOT EXISTS live_events (event_id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS live_receipts (provider_id TEXT PRIMARY KEY, status TEXT NOT NULL, recipient TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS live_analysis (
                    message_id TEXT PRIMARY KEY, wedding_id TEXT NOT NULL REFERENCES weddings(id), vendor_id TEXT NOT NULL,
                    brief_revision INTEGER NOT NULL, binding_revision INTEGER NOT NULL, status TEXT NOT NULL,
                    created_at TEXT NOT NULL, error TEXT NOT NULL DEFAULT ''
                );
                CREATE TABLE IF NOT EXISTS live_worker (
                    account_id TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at TEXT NOT NULL, heartbeat TEXT NOT NULL
                );
            ''')
            columns = {row['name'] for row in db.execute('PRAGMA table_info(live_outbox)')}
            for column in ('account_id', 'recipient'):
                if column not in columns:
                    db.execute(f"ALTER TABLE live_outbox ADD COLUMN {column} TEXT NOT NULL DEFAULT ''")

    @property
    def live_enabled(self):
        return self.settings.enabled and not self.piloting

    def state(self, db, wedding_id):
        bindings = [dict(row) for row in db.execute('SELECT * FROM live_bindings WHERE wedding_id=?', (wedding_id,)).fetchall()]
        wedding = db.execute('SELECT * FROM weddings WHERE id=?', (wedding_id,)).fetchone()
        for binding in bindings:
            binding['recipient'] = '+' + binding['recipient']
            binding['window_open'] = bool(binding['last_inbound_at'] and stamp(binding['last_inbound_at']) > clock() - timedelta(hours=24))
            binding['needs_reapproval'] = binding['consent_revision'] != wedding['revision'] or binding['account_id'] != self.settings.phone_number_id
            binding['opt_in'] = bool(binding['opt_in'])
            binding['stopped'] = bool(binding['stopped'])
        worker = db.execute('SELECT heartbeat,expires_at FROM live_worker WHERE account_id=?', (self.settings.phone_number_id,)).fetchone()
        return {'provider': self.settings.provider, 'configured': self.settings.configured, 'enabled': self.live_enabled, 'piloting': self.piloting,
                'incoming_webhook': self.settings.public_base_url + '/webhooks/twilio/whatsapp' if self.settings.provider == 'twilio' and self.settings.public_base_url else '',
                'status_webhook': self.settings.public_base_url + '/webhooks/twilio/status' if self.settings.provider == 'twilio' and self.settings.public_base_url else '',
                'missing': self.settings.missing(), 'verified': self.identity is not None,
                'display_phone': self.identity.get('display_phone', '') if self.identity else '',
                'template_verified': bool(self.identity and self.identity['template_verified']),
                'worker_active': bool(worker and stamp(worker['expires_at']) > clock()),
                'last_error': self.last_error, 'bindings': bindings,
                'deliveries': [dict(row) for row in db.execute('SELECT message_id,vendor_id,status,provider_id,error,created_at FROM live_outbox WHERE wedding_id=? ORDER BY created_at DESC LIMIT 100', (wedding_id,)).fetchall()]}

    def transaction(self, wedding_id, token, action):
        self.store.get(wedding_id, token)
        with self.store.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            wedding = db.execute('SELECT * FROM weddings WHERE id=?', (wedding_id,)).fetchone()
            state = load_coordination(db, wedding)
            result = action(db, wedding, state)
            save_coordination(db, wedding_id, state)
            return result

    @staticmethod
    def vendor(state, vendor_id):
        vendor = next((item for item in state['vendors'] if item['id'] == vendor_id), None)
        if vendor is None:
            raise HTTPException(404, 'Vendor not found')
        return vendor

    @staticmethod
    def queue(db, wedding, state, binding, message, automatic):
        timestamp = clock().isoformat()
        inserted = db.execute('''INSERT OR IGNORE INTO live_outbox
            (message_id,wedding_id,vendor_id,binding_revision,brief_revision,content,automatic,status,next_attempt_at,created_at,account_id,recipient)
            VALUES(?,?,?,?,?,?,?,'queued',?,?,?,?)''',
            (message['id'], wedding['id'], message['vendor_id'], binding['revision'], wedding['revision'], message['content'], int(automatic), timestamp, timestamp, binding['account_id'], binding['recipient']))
        if inserted.rowcount:
            message.update(status='queued', source='whatsapp')

    @staticmethod
    def cancel(db, wedding_id, state, vendor_id, reason):
        db.execute("UPDATE live_outbox SET status='cancelled',error=? WHERE wedding_id=? AND vendor_id=? AND status IN ('queued','waiting_window')", (reason, wedding_id, vendor_id))
        for message in state['messages']:
            if message['vendor_id'] == vendor_id and message['status'] == 'queued':
                message['status'] = 'cancelled'

    def ingest(self, payload):
        """Called only after raw-body signature verification. Unknown senders are not retained."""
        if not isinstance(payload, dict) or payload.get('object') != 'whatsapp_business_account':
            return
        with self.store.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            for entry in payload.get('entry', []):
                if entry.get('id') != self.settings.business_account_id:
                    continue
                for change in entry.get('changes', []):
                    value = change.get('value', {})
                    if change.get('field') != 'messages' or value.get('metadata', {}).get('phone_number_id') != self.settings.phone_number_id:
                        continue
                    for receipt in value.get('statuses', []):
                        self.receipt(db, receipt)
                    for incoming in value.get('messages', []):
                        self.incoming(db, incoming)

    def receipt(self, db, receipt):
        status = receipt.get('status')
        if status not in {'sent', 'delivered', 'read', 'failed'}:
            return
        previous = db.execute('SELECT status FROM live_receipts WHERE provider_id=?', (receipt.get('id'),)).fetchone()
        rank = {'sent': 1, 'failed': 2, 'delivered': 3, 'read': 4}
        if previous and rank[previous['status']] > rank[status]:
            return
        delivery = db.execute('SELECT * FROM live_outbox WHERE provider_id=?', (receipt.get('id'),)).fetchone()
        # Match the dispatched destination, even if the connection has since changed.
        # A callback can also race the HTTP result while the outbox is still sending.
        if delivery:
            valid = delivery['account_id'] == self.settings.phone_number_id and delivery['recipient'] == receipt.get('recipient_id')
        else:
            valid = db.execute("SELECT 1 FROM live_outbox WHERE account_id=? AND recipient=? AND status='sending'", (self.settings.phone_number_id, receipt.get('recipient_id'))).fetchone()
        if not valid:
            return
        db.execute('INSERT INTO live_receipts VALUES(?,?,?) ON CONFLICT(provider_id) DO UPDATE SET status=excluded.status', (receipt.get('id'), status, receipt.get('recipient_id')))
        if not delivery or delivery['status'] == 'read' or (delivery['status'] == 'delivered' and status in {'sent', 'failed'}):
            return
        db.execute('UPDATE live_outbox SET status=?,error=? WHERE message_id=?', (status, 'WhatsApp reported delivery failure.' if status == 'failed' else '', delivery['message_id']))
        wedding = db.execute('SELECT * FROM weddings WHERE id=?', (delivery['wedding_id'],)).fetchone()
        state = load_coordination(db, wedding)
        message = next((item for item in state['messages'] if item['id'] == delivery['message_id']), None)
        if message:
            message['status'] = status
        save_coordination(db, wedding['id'], state)

    def incoming(self, db, incoming):
        provider_id = incoming.get('id')
        if not isinstance(provider_id, str) or not isinstance(incoming.get('from'), str):
            return
        binding = db.execute('SELECT * FROM live_bindings WHERE account_id=? AND recipient=?', (self.settings.phone_number_id, incoming['from'])).fetchone()
        if not binding:
            return
        if not db.execute('INSERT OR IGNORE INTO live_events VALUES(?,?)', ('message:' + provider_id, clock().isoformat())).rowcount:
            return
        wedding = db.execute('SELECT * FROM weddings WHERE id=?', (binding['wedding_id'],)).fetchone()
        state = load_coordination(db, wedding)
        vendor = self.vendor(state, binding['vendor_id'])
        text = incoming.get('text', {}).get('body', '') if incoming.get('type') == 'text' else '[Non-text WhatsApp message: review in WhatsApp]'
        if not isinstance(text, str):
            return
        try:
            received = datetime.fromtimestamp(int(incoming['timestamp']), timezone.utc)
        except (KeyError, ValueError, TypeError, OverflowError, OSError):
            return
        received = min(received, clock())
        previous = stamp(binding['last_inbound_at']) if binding['last_inbound_at'] else received
        db.execute('UPDATE live_bindings SET last_inbound_at=? WHERE wedding_id=? AND vendor_id=?', (max(previous, received).isoformat(), wedding['id'], vendor['id']))
        if received > clock() - timedelta(hours=24):
            db.execute("UPDATE live_outbox SET status='queued',next_attempt_at=? WHERE wedding_id=? AND vendor_id=? AND status='waiting_window'", (clock().isoformat(), wedding['id'], vendor['id']))
        context_id = incoming.get('context', {}).get('id')
        context = db.execute('SELECT brief_revision FROM live_outbox WHERE provider_id=? AND wedding_id=? AND vendor_id=?', (context_id, wedding['id'], vendor['id'])).fetchone() if context_id else None
        source_revision = context['brief_revision'] if context else -1 if context_id else binding['consent_revision']
        message = dict(id=str(uuid4()), vendor_id=vendor['id'], content=text[:8000], direction='incoming', status='received',
                       source='whatsapp', provider_message_id=provider_id, brief_revision=source_revision, created_at=received.isoformat())
        state['messages'].append(message)
        normalized = text.strip().upper()
        if normalized in {'STOP', 'UNSUBSCRIBE', 'CANCEL MESSAGES'}:
            db.execute("UPDATE live_bindings SET mode='off',stopped=1,revision=revision+1 WHERE wedding_id=? AND vendor_id=?", (wedding['id'], vendor['id']))
            self.cancel(db, wedding['id'], state, vendor['id'], 'Vendor opted out.')
            vendor.update(needs_user_decision=True, decision_reason='The vendor opted out of WhatsApp messages.')
        elif normalized in {'HUMAN', 'HELP', 'AGENT'} or incoming.get('type') != 'text':
            db.execute("UPDATE live_bindings SET mode='review',revision=revision+1 WHERE wedding_id=? AND vendor_id=?", (wedding['id'], vendor['id']))
            vendor.update(needs_user_decision=True, decision_reason='The vendor requested human help or sent a non-text reply.')
            self.cancel(db, wedding['id'], state, vendor['id'], 'Human review requested.')
        elif normalized == 'START':
            db.execute("UPDATE live_bindings SET stopped=0,revision=revision+1 WHERE wedding_id=? AND vendor_id=?", (wedding['id'], vendor['id']))
        elif source_revision != wedding['revision']:
            vendor.update(needs_user_decision=True, decision_reason='A reply refers to an older wedding brief; review it before using its availability.')
        elif binding['mode'] != 'off' and not binding['stopped'] and received >= previous and received > clock() - timedelta(hours=24):
            db.execute("INSERT INTO live_analysis VALUES(?,?,?,?,?,'pending',?,'')", (message['id'], wedding['id'], vendor['id'], source_revision, binding['revision'], clock().isoformat()))
        save_coordination(db, wedding['id'], state)

    def enqueue_initial(self):
        if not self.live_enabled:
            return
        with self.store.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            for binding in db.execute("SELECT * FROM live_bindings WHERE mode='automatic' AND stopped=0 AND account_id=?", (self.settings.phone_number_id,)).fetchall():
                wedding = db.execute('SELECT * FROM weddings WHERE id=?', (binding['wedding_id'],)).fetchone()
                if wedding['status'] != 'confirmed' or wedding['revision'] != binding['consent_revision']:
                    continue
                state = load_coordination(db, wedding)
                vendor = self.vendor(state, binding['vendor_id'])
                if not vendor.get('active', True) or vendor.get('needs_user_decision'):
                    continue
                daily = db.execute('SELECT COUNT(*) FROM live_outbox WHERE wedding_id=? AND vendor_id=? AND automatic=1 AND created_at>=?', (wedding['id'], vendor['id'], (clock() - timedelta(days=1)).isoformat())).fetchone()[0]
                brief = WeddingBrief.model_validate_json(wedding['brief'])
                destination = hashlib.sha256((binding['account_id'] + ':' + binding['recipient']).encode()).hexdigest()[:16]
                key = f"live:availability:{vendor['id']}:{wedding['revision']}:{destination}"
                if daily < 3 and brief.date and vendor['availability'] == 'unknown' and not any(message.get('key') == key and message['status'] != 'cancelled' for message in state['messages']):
                    state['messages'].append(dict(id=str(uuid4()), vendor_id=vendor['id'], key=key, content=availability_text(brief),
                                                 purpose='availability', automatic_safe=True, direction='outgoing', status='draft',
                                                 brief_revision=wedding['revision'], created_at=clock().isoformat(), source='whatsapp'))
                for message in state['messages']:
                    if message['vendor_id'] == vendor['id'] and message['status'] == 'draft' and message.get('automatic_safe') and not message.get('ai_assisted') and message.get('purpose') == 'availability':
                        message['content'] = availability_text(brief)
                        self.queue(db, wedding, state, binding, message, True)
                save_coordination(db, wedding['id'], state)

    async def analyze_one(self):
        if not self.live_enabled or self.agent is None or not hasattr(self.agent, 'analyze_vendor_reply'):
            return
        with self.store.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            job = db.execute("SELECT a.* FROM live_analysis a JOIN live_bindings b ON a.wedding_id=b.wedding_id AND a.vendor_id=b.vendor_id WHERE a.status='pending' AND b.account_id=? ORDER BY a.created_at LIMIT 1", (self.settings.phone_number_id,)).fetchone()
            if not job:
                return
            db.execute("UPDATE live_analysis SET status='processing' WHERE message_id=?", (job['message_id'],))
            wedding = db.execute('SELECT * FROM weddings WHERE id=?', (job['wedding_id'],)).fetchone()
            state = load_coordination(db, wedding)
            binding = db.execute('SELECT * FROM live_bindings WHERE wedding_id=? AND vendor_id=?', (job['wedding_id'], job['vendor_id'])).fetchone()
            vendor = self.vendor(state, job['vendor_id'])
            history = [message for message in state['messages'] if message['vendor_id'] == vendor['id'] and message.get('source') == 'whatsapp']
            count = db.execute("SELECT COUNT(*) FROM live_analysis WHERE wedding_id=? AND vendor_id=? AND created_at>=? AND status IN ('processing','done','failed')", (wedding['id'], vendor['id'], (clock() - timedelta(days=1)).isoformat())).fetchone()[0]
            if not binding or binding['mode'] == 'off' or binding['stopped'] or binding['revision'] != job['binding_revision'] or wedding['revision'] != job['brief_revision'] or count > 6:
                db.execute("UPDATE live_analysis SET status='cancelled' WHERE message_id=?", (job['message_id'],))
                return
            brief = WeddingBrief.model_validate_json(wedding['brief'])
            current_message = next(message for message in history if message['id'] == job['message_id'])
            newest_incoming = next((message for message in reversed(history) if message['direction'] == 'incoming'), None)
            if newest_incoming is None or newest_incoming['id'] != job['message_id']:
                db.execute("UPDATE live_analysis SET status='cancelled' WHERE message_id=?", (job['message_id'],))
                return
            if current_message['content'].strip().lower() in {'hi', 'hello', 'hey'} and not any(message['direction'] == 'outgoing' and message['status'] in {'accepted', 'sent', 'delivered', 'read'} for message in history):
                db.execute("UPDATE live_analysis SET status='done' WHERE message_id=?", (job['message_id'],))
                return
            context = {'wedding_date': brief.date, 'location': brief.location, 'guests': brief.guests, 'vendor_category': vendor['category'],
                       'conversation': [{'direction': message['direction'], 'content': message['content'][:4000]} for message in history[-6:]]}
        try:
            analysis = VendorReplyAnalysis.model_validate(await self.agent.analyze_vendor_reply(context))
        except Exception:
            with self.store.connection() as db:
                db.execute('BEGIN IMMEDIATE')
                db.execute("UPDATE live_analysis SET status='failed',error='AI analysis failed; review the original reply.' WHERE message_id=?", (job['message_id'],))
                current = db.execute('SELECT * FROM weddings WHERE id=?', (job['wedding_id'],)).fetchone()
                if current['revision'] == job['brief_revision']:
                    state = load_coordination(db, current)
                    self.vendor(state, job['vendor_id']).update(needs_user_decision=True, decision_reason='AI reply analysis failed. Review the original vendor message before continuing.')
                    save_coordination(db, current['id'], state)
            return
        with self.store.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            wedding = db.execute('SELECT * FROM weddings WHERE id=?', (job['wedding_id'],)).fetchone()
            binding = db.execute('SELECT * FROM live_bindings WHERE wedding_id=? AND vendor_id=?', (job['wedding_id'], job['vendor_id'])).fetchone()
            state = load_coordination(db, wedding)
            incoming = [message for message in state['messages'] if message['vendor_id'] == job['vendor_id'] and message.get('source') == 'whatsapp' and message['direction'] == 'incoming']
            if not binding or binding['revision'] != job['binding_revision'] or binding['stopped'] or wedding['revision'] != job['brief_revision'] or not incoming or incoming[-1]['id'] != job['message_id']:
                db.execute("UPDATE live_analysis SET status='cancelled' WHERE message_id=?", (job['message_id'],))
                return
            vendor = self.vendor(state, job['vendor_id'])
            brief = WeddingBrief.model_validate_json(wedding['brief'])
            if analysis.availability_date == brief.date and analysis.availability != 'unknown':
                vendor.update(availability=analysis.availability, availability_revision=wedding['revision'], evidence_id=job['message_id'], availability_source='whatsapp_ai')
                for pending in state['messages']:
                    if pending['vendor_id'] == vendor['id'] and pending.get('purpose') == 'availability' and pending['status'] in {'draft', 'queued'}:
                        pending['status'] = 'cancelled'
                        db.execute("UPDATE live_outbox SET status='cancelled',error='The vendor already answered availability.' WHERE message_id=? AND status IN ('queued','waiting_window')", (pending['id'],))
            reason = vendor.get('decision_reason') if vendor.get('needs_user_decision') and not analysis.needs_user_decision else analysis.reason
            vendor.update(needs_user_decision=bool(vendor.get('needs_user_decision')) or analysis.needs_user_decision or analysis.availability == 'unavailable', decision_reason=reason)
            incoming[-1]['analysis'] = analysis.model_dump()
            if not vendor['needs_user_decision'] and binding['mode'] == 'automatic' and wedding['status'] == 'confirmed' and analysis.next_question != 'none':
                key = f"followup:{vendor['id']}:{wedding['revision']}:{analysis.next_question}"
                already = any(message.get('key') == key for message in state['messages'])
                sent = db.execute('SELECT COUNT(*) FROM live_outbox WHERE wedding_id=? AND vendor_id=? AND automatic=1 AND created_at>=?', (wedding['id'], vendor['id'], (clock() - timedelta(days=1)).isoformat())).fetchone()[0]
                pending = any(message['vendor_id'] == vendor['id'] and message['direction'] == 'outgoing' and message['status'] in {'draft', 'queued', 'sending'} for message in state['messages'])
                if not already and sent < 3 and not pending:
                    question = f'Could you confirm availability for {brief.date} in {brief.location} for {brief.guests} guests?' if analysis.next_question == 'availability' else QUESTIONS[analysis.next_question]
                    message = dict(id=str(uuid4()), vendor_id=vendor['id'], key=key, purpose=analysis.next_question,
                                   content=question + ' ' + FOOTER, direction='outgoing', status='draft', source='whatsapp',
                                   brief_revision=wedding['revision'], created_at=clock().isoformat(), automatic_safe=True)
                    state['messages'].append(message)
                    self.queue(db, wedding, state, binding, message, True)
            db.execute("UPDATE live_analysis SET status='done' WHERE message_id=?", (job['message_id'],))
            save_coordination(db, wedding['id'], state)

    async def send_one(self):
        if not self.live_enabled:
            return
        with self.store.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute("SELECT o.* FROM live_outbox o JOIN live_bindings b ON o.wedding_id=b.wedding_id AND o.vendor_id=b.vendor_id WHERE o.status IN ('queued','waiting_window') AND o.next_attempt_at<=? AND b.account_id=? ORDER BY o.created_at LIMIT 1", (clock().isoformat(), self.settings.phone_number_id)).fetchone()
            if not row:
                return
            wedding = db.execute('SELECT * FROM weddings WHERE id=?', (row['wedding_id'],)).fetchone()
            binding = db.execute('SELECT * FROM live_bindings WHERE wedding_id=? AND vendor_id=?', (row['wedding_id'], row['vendor_id'])).fetchone()
            state = load_coordination(db, wedding)
            vendor = self.vendor(state, row['vendor_id'])
            message = next((item for item in state['messages'] if item['id'] == row['message_id']), None)
            invalid = not binding or binding['revision'] != row['binding_revision'] or binding['account_id'] != self.settings.phone_number_id or row['account_id'] != binding['account_id'] or row['recipient'] != binding['recipient'] or not binding['opt_in'] or binding['stopped'] or binding['mode'] == 'off' or wedding['revision'] != row['brief_revision'] or wedding['status'] != 'confirmed' or not vendor.get('active', True) or message is None or message['status'] == 'cancelled' or message['content'] != row['content'] or (row['automatic'] and (binding['mode'] != 'automatic' or vendor.get('needs_user_decision')))
            if invalid:
                db.execute("UPDATE live_outbox SET status='cancelled',error='The plan, recipient or permission changed before dispatch.' WHERE message_id=?", (row['message_id'],))
                if message and message['status'] == 'queued':
                    message['status'] = 'cancelled'
                save_coordination(db, wedding['id'], state)
                return
            window_open = binding['last_inbound_at'] and stamp(binding['last_inbound_at']) > clock() - timedelta(hours=24)
            parameters = None
            if not window_open:
                brief = WeddingBrief.model_validate_json(wedding['brief'])
                if not self.identity or not self.identity['template_verified'] or message.get('purpose') != 'availability' or message.get('ai_assisted') or row['content'] != availability_text(brief):
                    db.execute("UPDATE live_outbox SET status='waiting_window',error='Waiting for a vendor reply within 24 hours or the approved availability template.',next_attempt_at=? WHERE message_id=?", ((clock() + timedelta(seconds=30)).isoformat(), row['message_id']))
                    return
                parameters = [brief.date, brief.location, brief.guests]
            db.execute("UPDATE live_outbox SET status='sending',attempts=attempts+1,claimed_at=? WHERE message_id=?", (clock().isoformat(), row['message_id']))
        try:
            provider_id = await self.transport.send(binding['recipient'], row['content'], parameters)
            status, error, retry_at = 'accepted', '', clock()
        except TransportError as issue:
            provider_id = None
            status = 'uncertain' if issue.uncertain else 'waiting_window' if issue.window_closed else 'queued' if issue.retry_after and row['attempts'] < 2 else 'failed'
            error, retry_at = str(issue), clock() + timedelta(seconds=issue.retry_after or 30)
        except Exception:
            provider_id, status, error, retry_at = None, 'uncertain', 'Delivery was not confirmed. Check WhatsApp before retrying.', clock()
        with self.store.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            if provider_id:
                receipt = db.execute('SELECT * FROM live_receipts WHERE provider_id=?', (provider_id,)).fetchone()
                if receipt and receipt['recipient'] == binding['recipient']:
                    status = receipt['status']
                    error = 'WhatsApp reported delivery failure.' if status == 'failed' else ''
            db.execute('UPDATE live_outbox SET status=?,provider_id=?,error=?,next_attempt_at=? WHERE message_id=?', (status, provider_id, error, retry_at.isoformat(), row['message_id']))
            wedding = db.execute('SELECT * FROM weddings WHERE id=?', (row['wedding_id'],)).fetchone()
            state = load_coordination(db, wedding)
            message = next(item for item in state['messages'] if item['id'] == row['message_id'])
            message.update(status=status if status not in {'waiting_window'} else 'queued', provider_message_id=provider_id, delivery_error=error)
            save_coordination(db, wedding['id'], state)

    def claim_worker(self):
        with self.store.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM live_worker WHERE account_id=?', (self.settings.phone_number_id,)).fetchone()
            if row and row['owner'] != self.owner and stamp(row['expires_at']) > clock():
                return False
            db.execute('INSERT INTO live_worker VALUES(?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at,heartbeat=excluded.heartbeat',
                       (self.settings.phone_number_id, self.owner, (clock() + timedelta(seconds=120)).isoformat(), clock().isoformat()))
            stale = db.execute("SELECT o.* FROM live_outbox o JOIN live_bindings b ON o.wedding_id=b.wedding_id AND o.vendor_id=b.vendor_id WHERE o.status='sending' AND o.claimed_at<? AND b.account_id=?", ((clock() - timedelta(seconds=120)).isoformat(), self.settings.phone_number_id)).fetchall()
            for delivery in stale:
                reason = 'Worker stopped during dispatch. Check WhatsApp before retrying.'
                db.execute("UPDATE live_outbox SET status='uncertain',error=? WHERE message_id=?", (reason, delivery['message_id']))
                wedding = db.execute('SELECT * FROM weddings WHERE id=?', (delivery['wedding_id'],)).fetchone()
                state = load_coordination(db, wedding)
                for message in state['messages']:
                    if message['id'] == delivery['message_id']:
                        message.update(status='uncertain', delivery_error=reason)
                save_coordination(db, wedding['id'], state)
            db.execute("UPDATE live_analysis SET status='failed',error='Worker stopped during analysis; review the original reply.' WHERE status='processing' AND created_at<?", ((clock() - timedelta(seconds=120)).isoformat(),))
            return True

    async def worker(self):
        while True:
            pause = 3
            try:
                if self.claim_worker():
                    if self.identity is None:
                        self.identity = await self.transport.verify()
                    self.enqueue_initial()
                    await self.analyze_one()
                    await self.send_one()
                    self.last_error = ''
            except asyncio.CancelledError:
                raise
            except TransportError as issue:
                self.last_error = str(issue)
                pause = 30
            except Exception:
                self.last_error = 'WhatsApp connection needs attention. Check backend credentials and account setup.'
                pause = 30
            await asyncio.sleep(pause)

    def start(self):
        if self.live_enabled and self.settings.configured and self.transport:
            self.task = asyncio.create_task(self.worker())

    async def close(self):
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
            with self.store.connection() as db:
                db.execute('DELETE FROM live_worker WHERE account_id=? AND owner=?', (self.settings.phone_number_id, self.owner))
        if self.transport:
            await self.transport.close()


def messaging_router(service):
    router = APIRouter(tags=['whatsapp'])
    prefix = '/api/weddings/{wedding_id}/messaging'

    @router.get(prefix)
    def overview(wedding_id: str, x_wedding_token: str = Header(default='')):
        service.store.get(wedding_id, x_wedding_token)
        with service.store.connection() as db:
            return service.state(db, wedding_id)

    @router.patch(prefix + '/vendors/{vendor_id}')
    def connect(wedding_id: str, vendor_id: str, body: ConnectionChange, x_wedding_token: str = Header(default='')):
        def action(db, wedding, state):
            vendor = service.vendor(state, vendor_id)
            binding = db.execute('SELECT * FROM live_bindings WHERE wedding_id=? AND vendor_id=?', (wedding_id, vendor_id)).fetchone()
            if body.brief_revision != wedding['revision'] or body.expected_revision != (binding['revision'] if binding else 0):
                raise HTTPException(409, 'Plan or WhatsApp connection changed. Refresh before enabling messages.')
            if vendor['channel'] != 'whatsapp':
                raise HTTPException(422, 'This connection supports individual WhatsApp numbers only')
            if body.mode != 'off':
                if not service.settings.configured or not service.live_enabled or service.identity is None:
                    raise HTTPException(503, 'Configure and verify WhatsApp on the backend before enabling live messages')
                if wedding['status'] != 'confirmed' or missing_fields(WeddingBrief.model_validate_json(wedding['brief'])):
                    raise HTTPException(422, 'Complete and confirm the wedding brief first')
                if not vendor.get('active', True) or not body.opt_in or not body.consent_note.strip():
                    raise HTTPException(422, 'An active vendor and a record of their WhatsApp opt-in are required')
                if binding and binding['stopped'] and binding['recipient'] == body.recipient:
                    raise HTTPException(409, 'This vendor opted out. They must send START before messages can resume.')
                if body.mode == 'automatic' and not hasattr(service.agent, 'analyze_vendor_reply'):
                    raise HTTPException(503, 'Configure Claude or OpenAI before enabling automatic conversations')
            if binding and binding['recipient'] == body.recipient and binding['mode'] == body.mode and binding['opt_in'] == int(body.opt_in) and binding['consent_note'] == body.consent_note.strip() and binding['consent_revision'] == wedding['revision'] and binding['account_id'] == service.settings.phone_number_id and not vendor.get('needs_user_decision'):
                return service.state(db, wedding_id)
            service.cancel(db, wedding_id, state, vendor_id, 'WhatsApp connection or permission changed.')
            inbound = binding['last_inbound_at'] if binding and binding['recipient'] == body.recipient and binding['account_id'] == service.settings.phone_number_id else None
            try:
                db.execute('''INSERT INTO live_bindings
                    (wedding_id,vendor_id,account_id,recipient,revision,mode,opt_in,consent_note,consent_revision,last_inbound_at,stopped)
                    VALUES(?,?,?,?,?,?,?,?,?,?,0) ON CONFLICT(wedding_id,vendor_id) DO UPDATE SET
                    account_id=excluded.account_id,recipient=excluded.recipient,revision=excluded.revision,mode=excluded.mode,
                    opt_in=excluded.opt_in,consent_note=excluded.consent_note,consent_revision=excluded.consent_revision,
                    last_inbound_at=excluded.last_inbound_at,
                    stopped=CASE WHEN live_bindings.recipient=excluded.recipient THEN live_bindings.stopped ELSE 0 END''',
                    (wedding_id, vendor_id, service.settings.phone_number_id, body.recipient, (binding['revision'] if binding else 0) + 1,
                     body.mode, int(body.opt_in), body.consent_note.strip(), wedding['revision'], inbound))
            except sqlite3.IntegrityError:
                raise HTTPException(409, 'That WhatsApp conversation is already assigned to another vendor or wedding. Separate conversations must not share replies.') from None
            if body.mode == 'automatic':
                vendor.update(needs_user_decision=False, decision_reason='')
                for message in state['messages']:
                    if message['vendor_id'] == vendor_id and message['status'] == 'draft' and message.get('purpose') == 'availability':
                        message['status'] = 'cancelled'
            vendor['messaging_mode'] = body.mode
            return service.state(db, wedding_id)
        return service.transaction(wedding_id, x_wedding_token, action)

    @router.post(prefix + '/vendors/{vendor_id}/drafts', status_code=201)
    def compose(wedding_id: str, vendor_id: str, body: ManualDraft, x_wedding_token: str = Header(default='')):
        def action(db, wedding, state):
            if service.vendor(state, vendor_id)['channel'] != 'whatsapp':
                raise HTTPException(422, 'Choose a WhatsApp vendor')
            if body.brief_revision != wedding['revision']:
                raise HTTPException(409, 'The wedding changed. Refresh before writing a message.')
            if not body.content.strip():
                raise HTTPException(422, 'Write a message first')
            message = dict(id=str(uuid4()), vendor_id=vendor_id, purpose='manual', content=body.content.strip(),
                           direction='outgoing', status='draft', source='whatsapp', automatic_safe=False,
                           brief_revision=wedding['revision'], created_at=clock().isoformat())
            state['messages'].append(message)
            return message
        return service.transaction(wedding_id, x_wedding_token, action)

    @router.post(prefix + '/messages/{message_id}/send')
    def approve(wedding_id: str, message_id: str, body: SendApproval, x_wedding_token: str = Header(default='')):
        def action(db, wedding, state):
            if not service.live_enabled or not service.settings.configured or service.identity is None:
                raise HTTPException(503, 'WhatsApp is not connected')
            message = next((item for item in state['messages'] if item['id'] == message_id), None)
            if message is None:
                raise HTTPException(404, 'Message not found')
            binding = db.execute('SELECT * FROM live_bindings WHERE wedding_id=? AND vendor_id=?', (wedding_id, message['vendor_id'])).fetchone()
            if not binding or binding['revision'] != body.binding_revision or wedding['revision'] != body.brief_revision or message.get('brief_revision') != wedding['revision'] or message['content'] != body.expected_content:
                raise HTTPException(409, 'Message, recipient or brief changed. Review the exact message again.')
            if wedding['status'] != 'confirmed' or binding['mode'] == 'off' or not binding['opt_in'] or binding['stopped']:
                raise HTTPException(422, 'Confirm the brief and enable this opted-in vendor’s WhatsApp connection first')
            if message['status'] == 'draft':
                service.queue(db, wedding, state, binding, message, False)
            elif not db.execute('SELECT 1 FROM live_outbox WHERE message_id=?', (message_id,)).fetchone():
                raise HTTPException(409, 'This message is not a live draft')
            return service.state(db, wedding_id)
        return service.transaction(wedding_id, x_wedding_token, action)

    @router.get('/webhooks/whatsapp')
    def verify(request: Request):
        token = service.settings.verify_token
        if not token:
            raise HTTPException(503, 'Webhook verification is not configured')
        if request.query_params.get('hub.mode') != 'subscribe' or not secrets.compare_digest(request.query_params.get('hub.verify_token', ''), token):
            raise HTTPException(403, 'Webhook verification failed')
        return PlainTextResponse(request.query_params.get('hub.challenge', ''))

    @router.post('/webhooks/whatsapp')
    async def incoming(request: Request):
        if service.piloting:
            raise HTTPException(503, 'WhatsApp is piloting; live callbacks are paused')
        if not service.settings.app_secret:
            raise HTTPException(503, 'Webhook verification is not configured')
        raw = bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > 1_000_000:
                raise HTTPException(413, 'Webhook body too large')
        expected = 'sha256=' + hmac.new(service.settings.app_secret.encode(), raw, hashlib.sha256).hexdigest()
        if not secrets.compare_digest(request.headers.get('x-hub-signature-256', ''), expected):
            raise HTTPException(403, 'Webhook signature verification failed')
        try:
            payload = json.loads(raw)
        except ValueError:
            raise HTTPException(400, 'Invalid webhook JSON') from None
        service.ingest(payload)
        return {'received': True}

    async def twilio_form(request):
        if service.piloting:
            raise HTTPException(503, 'WhatsApp is piloting; live callbacks are paused')
        if service.settings.provider != 'twilio' or not service.settings.configured:
            raise HTTPException(503, 'Twilio is not configured')
        if request.headers.get('content-type', '').split(';', 1)[0] != 'application/x-www-form-urlencoded':
            raise HTTPException(415, 'Expected a Twilio form webhook')
        raw = bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > 1_000_000:
                raise HTTPException(413, 'Webhook body too large')
        try:
            fields = parse_qs(raw.decode(), keep_blank_values=True, strict_parsing=True, max_num_fields=200)
        except (UnicodeDecodeError, ValueError):
            raise HTTPException(400, 'Invalid webhook form') from None
        if any(len(values) != 1 for values in fields.values()):
            raise HTTPException(400, 'Duplicate webhook fields are not accepted')
        fields = {key: values[0] for key, values in fields.items()}
        canonical_url = service.settings.public_base_url + request.url.path
        if request.url.query:
            canonical_url += '?' + request.url.query
        if not valid_signature(service.settings.auth_token, canonical_url, fields, request.headers.get('x-twilio-signature', '')):
            raise HTTPException(403, 'Twilio signature verification failed')
        if fields.get('AccountSid') != service.settings.account_sid:
            raise HTTPException(403, 'Wrong Twilio account')
        return fields

    @router.post('/webhooks/twilio/whatsapp')
    async def twilio_incoming(request: Request):
        fields = await twilio_form(request)
        if fields.get('To') != 'whatsapp:' + service.settings.from_number:
            raise HTTPException(403, 'Wrong WhatsApp sender number')
        sid = fields.get('MessageSid', '')
        with service.store.connection() as db:
            duplicate = db.execute('SELECT 1 FROM live_events WHERE event_id=?', ('message:' + sid,)).fetchone()
            known = db.execute('SELECT 1 FROM live_bindings WHERE account_id=? AND recipient=?', (service.settings.phone_number_id, fields.get('From', '').removeprefix('whatsapp:+'))).fetchone()
        if not duplicate and known:
            try:
                detail, timestamp = await service.transport.incoming_details(sid)
            except TransportError:
                raise HTTPException(503, 'Could not verify the original incoming message; Twilio can retry.') from None
            if detail.get('from') != fields.get('From') or detail.get('to') != fields.get('To'):
                raise HTTPException(403, 'Twilio message identity mismatch')
            incoming = {'id': sid, 'from': fields['From'].removeprefix('whatsapp:+'), 'timestamp': timestamp,
                        'type': 'text' if fields.get('NumMedia', '0') == '0' else 'media', 'text': {'body': fields.get('Body', '')}}
            if fields.get('OriginalRepliedMessageSid'):
                incoming['context'] = {'id': fields['OriginalRepliedMessageSid']}
            service.ingest({'object': 'whatsapp_business_account', 'entry': [{'id': service.settings.business_account_id,
                'changes': [{'field': 'messages', 'value': {'metadata': {'phone_number_id': service.settings.phone_number_id}, 'messages': [incoming]}}]}]})
        return Response('<?xml version="1.0" encoding="UTF-8"?><Response/>', media_type='application/xml')

    @router.post('/webhooks/twilio/status')
    async def twilio_status(request: Request):
        fields = await twilio_form(request)
        provider_status = fields.get('MessageStatus', '')
        status = {'sent': 'sent', 'delivered': 'delivered', 'read': 'read', 'failed': 'failed', 'undelivered': 'failed'}.get(provider_status)
        if status:
            with service.store.connection() as db:
                db.execute('BEGIN IMMEDIATE')
                service.receipt(db, {'id': fields.get('MessageSid'), 'status': status,
                                     'recipient_id': fields.get('To', '').removeprefix('whatsapp:+')})
        return Response(status_code=204)

    return router

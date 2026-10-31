"""Evidence-backed coordination in simulated transport mode."""
import json
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException
from pydantic import Field, AwareDatetime
from openai import APIError, APITimeoutError
from anthropic import APIError as ClaudeAPIError, APITimeoutError as ClaudeTimeoutError

from .models import Model
from .store import now


class Vendor(Model):
    name: str = Field(min_length=1, max_length=200)
    category: Literal['dress', 'catering', 'emcee', 'flowers', 'venue', 'accommodation']
    channel: Literal['whatsapp', 'telegram']
    contact: str = Field(min_length=1, max_length=200)


class Task(Model):
    vendor_id: str
    title: str = Field(min_length=1, max_length=300)
    due_at: AwareDatetime


class Reply(Model):
    content: str = Field(min_length=1, max_length=4000)
    availability: Literal['unknown', 'available', 'unavailable'] = 'unknown'
    brief_revision: Optional[int] = Field(default=None, ge=0)


class Run(Model):
    reminder_hours: int = Field(default=72, ge=1, le=168)


class Participation(Model):
    active: bool


def load_coordination(db, wedding):
    row = db.execute('SELECT state FROM coordination WHERE wedding_id=?', (wedding['id'],)).fetchone()
    state = json.loads(row['state']) if row else {'vendors': [], 'tasks': [], 'messages': []}
    for vendor in state['vendors']:
        if vendor['availability_revision'] != wedding['revision']:
            vendor.update(availability='unknown', evidence_id=None)
    for message in state['messages']:
        if message['status'] == 'draft' and message['brief_revision'] != wedding['revision']:
            message['status'] = 'cancelled'
    return state


def save_coordination(db, wedding_id, state):
    db.execute('INSERT INTO coordination VALUES (?,?) ON CONFLICT(wedding_id) DO UPDATE SET state=excluded.state',
               (wedding_id, json.dumps(state)))


def prepare_drafts(state, wedding, reminder_hours=72, timestamp=None, limit=20):
    """A bounded, shared draft-only tool. Existing keys make re-runs harmless."""
    timestamp = timestamp or datetime.now(timezone.utc)
    brief = json.loads(wedding['brief'])
    existing = {message.get('key') for message in state['messages'] if message['status'] != 'cancelled'}
    created = []

    def add(vendor, key, content):
        if key in existing or len(created) >= limit:
            return
        message = dict(id=str(uuid4()), vendor_id=vendor['id'], key=key, content=content,
                       direction='outgoing', status='draft', brief_revision=wedding['revision'],
                       created_at=timestamp.isoformat())
        state['messages'].append(message)
        existing.add(key)
        created.append(message)

    for vendor in state['vendors']:
        if vendor.get('active', True) and brief['date'] and vendor['availability'] == 'unknown':
            add(vendor, f"availability:{vendor['id']}:{wedding['revision']}",
                f"Hello {vendor['name']}, are you available for a wedding on {brief['date']} in {brief['location'] or 'a location to be confirmed'}? Please share your capacity, pricing, inclusions and exclusions. This is an enquiry, not a booking.")
    vendors = {vendor['id']: vendor for vendor in state['vendors']}
    for task in state['tasks']:
        vendor = vendors.get(task['vendor_id'])
        if vendor and vendor.get('active', True) and vendor['availability'] != 'unavailable' and not task['done'] and datetime.fromisoformat(task['due_at'].replace('Z', '+00:00')) <= timestamp + timedelta(hours=reminder_hours):
            add(vendor, 'reminder:' + task['id'] + ':' + str(wedding['revision']),
                f"Hello {vendor['name']}, reminder: {task['title']} is due {task['due_at']}. Please share an update or flag any delay.")
    return created


def coordinator_router(store, agent=None):
    router = APIRouter(prefix='/api/weddings/{wedding_id}/coordination')
    with store.connection() as db:
        db.execute('CREATE TABLE IF NOT EXISTS coordination (wedding_id TEXT PRIMARY KEY REFERENCES weddings(id), state TEXT NOT NULL)')

    def transaction(wedding_id, token, operation):
        wedding = store.get(wedding_id, token)
        with store.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            # Read current brief within the same transaction as draft creation/delivery.
            wedding = db.execute('SELECT * FROM weddings WHERE id=?', (wedding_id,)).fetchone()
            state = load_coordination(db, wedding)
            result = operation(state, wedding)
            save_coordination(db, wedding_id, state)
            return result

    def find(items, identifier):
        item = next((item for item in items if item['id'] == identifier), None)
        if item is None:
            raise HTTPException(404, 'Record not found')
        return item

    @router.get('')
    def overview(wedding_id: str, x_wedding_token: str = Header(default='')):
        return transaction(wedding_id, x_wedding_token, lambda state, _: dict(state, mode='simulation'))

    @router.post('/vendors', status_code=201)
    def add_vendor(wedding_id: str, body: Vendor, x_wedding_token: str = Header(default='')):
        def operation(state, wedding):
            vendor = dict(body.model_dump(), id=str(uuid4()), active=True, availability='unknown', evidence_id=None, availability_revision=None)
            state['vendors'].append(vendor)
            return vendor
        return transaction(wedding_id, x_wedding_token, operation)

    @router.post('/vendors/{vendor_id}/participation')
    def participation(wedding_id: str, vendor_id: str, body: Participation, x_wedding_token: str = Header(default='')):
        def operation(state, wedding):
            vendor = find(state['vendors'], vendor_id)
            if vendor.get('active', True) == body.active:
                return vendor
            vendor['active'] = body.active
            if body.active:
                vendor.update(availability='unknown', evidence_id=None, availability_revision=None)
            else:
                for message in state['messages']:
                    if message['vendor_id'] == vendor_id and message['status'] == 'draft':
                        message['status'] = 'cancelled'
            return vendor
        return transaction(wedding_id, x_wedding_token, operation)

    @router.post('/tasks', status_code=201)
    def add_task(wedding_id: str, body: Task, x_wedding_token: str = Header(default='')):
        def operation(state, wedding):
            if not find(state['vendors'], body.vendor_id).get('active', True):
                raise HTTPException(409, 'Restore this vendor before adding a deliverable')
            task = dict(body.model_dump(mode='json'), id=str(uuid4()), done=False)
            state['tasks'].append(task)
            return task
        return transaction(wedding_id, x_wedding_token, operation)

    @router.post('/tasks/{task_id}/complete')
    def complete(wedding_id: str, task_id: str, x_wedding_token: str = Header(default='')):
        def operation(state, wedding):
            task = find(state['tasks'], task_id)
            task['done'] = True
            for message in state['messages']:
                if message.get('key', '').startswith('reminder:' + task_id + ':') and message['status'] == 'draft':
                    message['status'] = 'cancelled'
            return task
        return transaction(wedding_id, x_wedding_token, operation)

    @router.post('/vendors/{vendor_id}/replies', status_code=201)
    def reply(wedding_id: str, vendor_id: str, body: Reply, x_wedding_token: str = Header(default='')):
        def operation(state, wedding):
            if body.brief_revision is not None and body.brief_revision != wedding['revision']:
                raise HTTPException(409, 'Wedding changed. Review the date before annotating availability.')
            vendor = find(state['vendors'], vendor_id)
            message = dict(id=str(uuid4()), vendor_id=vendor_id, content=body.content, direction='incoming', status='simulated', created_at=now())
            state['messages'].append(message)
            # Availability is explicitly annotated by the user; free text is never treated as authority.
            vendor.update(availability=body.availability, evidence_id=message['id'], availability_revision=wedding['revision'])
            return message
        return transaction(wedding_id, x_wedding_token, operation)

    @router.post('/run')
    def run(wedding_id: str, body: Run, x_wedding_token: str = Header(default='')):
        def operation(state, wedding):
            prepare_drafts(state, wedding, body.reminder_hours)
            return dict(state, mode='simulation', note='Rule-based coordinator. Drafts require approval; no external messages are sent.')
        return transaction(wedding_id, x_wedding_token, operation)

    @router.post('/messages/{message_id}/refine')
    async def refine(wedding_id: str, message_id: str, x_wedding_token: str = Header(default='')):
        def context(state, wedding):
            message = find(state['messages'], message_id)
            if message['status'] != 'draft':
                raise HTTPException(409, 'Only current drafts can be refined')
            return dict(draft=dict(message), vendor=dict(find(state['vendors'], message['vendor_id'])),
                        wedding_brief=json.loads(wedding['brief']))
        data = transaction(wedding_id, x_wedding_token, context)
        if agent is None:
            raise HTTPException(503, 'AI is not configured; generated rule-based drafts still work')
        try:
            content = await agent.draft_coordination(data)
        except (APITimeoutError, ClaudeTimeoutError):
            raise HTTPException(504, 'AI timed out; draft unchanged')
        except (APIError, ClaudeAPIError, ValueError):
            raise HTTPException(502, 'AI could not produce a draft; draft unchanged')
        def save(state, wedding):
            message = find(state['messages'], message_id)
            if message != data['draft'] or message['status'] != 'draft':
                raise HTTPException(409, 'Draft changed during AI request; refresh and retry')
            message['content'] = content
            message['ai_assisted'] = True
            return message
        return transaction(wedding_id, x_wedding_token, save)

    @router.post('/messages/{message_id}/approve')
    def approve(wedding_id: str, message_id: str, x_wedding_token: str = Header(default='')):
        def operation(state, wedding):
            message = find(state['messages'], message_id)
            if message['direction'] != 'outgoing' or message['status'] == 'cancelled':
                raise HTTPException(409, 'Only outgoing drafts can be approved')
            if message['brief_revision'] != wedding['revision']:
                raise HTTPException(409, 'Wedding changed; review and generate current drafts')
            message['status'] = 'simulated'
            return message
        return transaction(wedding_id, x_wedding_token, operation)

    return router

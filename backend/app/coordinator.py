"""Evidence-backed coordination in simulated transport mode."""
import json
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException
from pydantic import Field, AwareDatetime
from openai import APIError, APITimeoutError

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


class Run(Model):
    reminder_hours: int = Field(default=72, ge=1, le=168)


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
            row = db.execute('SELECT state FROM coordination WHERE wedding_id=?', (wedding_id,)).fetchone()
            state = json.loads(row['state']) if row else {'vendors': [], 'tasks': [], 'messages': []}
            for vendor in state['vendors']:
                if vendor['availability_revision'] != wedding['revision']:
                    vendor.update(availability='unknown', evidence_id=None)
            for message in state['messages']:
                if message['status'] == 'draft' and message['brief_revision'] != wedding['revision']:
                    message['status'] = 'cancelled'
            result = operation(state, wedding)
            db.execute('INSERT INTO coordination VALUES (?,?) ON CONFLICT(wedding_id) DO UPDATE SET state=excluded.state', (wedding_id, json.dumps(state)))
            return result

    def find(items, identifier):
        item = next((item for item in items if item['id'] == identifier), None)
        if item is None:
            raise HTTPException(404, 'Record not found')
        return item

    def draft(state, wedding, vendor, key, text):
        # One reminder per task deadline; one enquiry per brief revision.
        if any(m.get('key') == key for m in state['messages']):
            return
        state['messages'].append(dict(id=str(uuid4()), vendor_id=vendor['id'], key=key,
            content=text, direction='outgoing', status='draft', brief_revision=wedding['revision'], created_at=now()))

    @router.get('')
    def overview(wedding_id: str, x_wedding_token: str = Header(default='')):
        return transaction(wedding_id, x_wedding_token, lambda state, _: dict(state, mode='simulation'))

    @router.post('/vendors', status_code=201)
    def add_vendor(wedding_id: str, body: Vendor, x_wedding_token: str = Header(default='')):
        def operation(state, wedding):
            vendor = dict(body.model_dump(), id=str(uuid4()), availability='unknown', evidence_id=None, availability_revision=None)
            state['vendors'].append(vendor)
            return vendor
        return transaction(wedding_id, x_wedding_token, operation)

    @router.post('/tasks', status_code=201)
    def add_task(wedding_id: str, body: Task, x_wedding_token: str = Header(default='')):
        def operation(state, wedding):
            find(state['vendors'], body.vendor_id)
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
            brief = json.loads(wedding['brief'])
            for vendor in state['vendors']:
                if vendor['availability_revision'] != wedding['revision']:
                    vendor['availability'] = 'unknown'
                    vendor['evidence_id'] = None
                if brief['date'] and vendor['availability'] == 'unknown':
                    draft(state, wedding, vendor, f"availability:{vendor['id']}:{wedding['revision']}",
                        f"Hello {vendor['name']}, are you available for a wedding on {brief['date']} in {brief['location'] or 'a location to be confirmed'}? Please share your capacity, pricing, inclusions and exclusions. This is an enquiry, not a booking.")
            for task in state['tasks']:
                if not task['done'] and datetime.fromisoformat(task['due_at']) <= datetime.now(timezone.utc) + timedelta(hours=body.reminder_hours):
                    vendor = find(state['vendors'], task['vendor_id'])
                    draft(state, wedding, vendor, 'reminder:' + task['id'] + ':' + str(wedding['revision']), f"Hello {vendor['name']}, reminder: {task['title']} is due {task['due_at']}. Please share an update or flag any delay.")
            return dict(state, mode='simulation', note='Rule-based coordinator. Drafts require approval; no external messages are sent.')
        return transaction(wedding_id, x_wedding_token, operation)

    @router.post('/messages/{message_id}/refine')
    async def refine(wedding_id: str, message_id: str, x_wedding_token: str = Header(default='')):
        def context(state, wedding):
            message = find(state['messages'], message_id)
            if message['status'] != 'draft':
                raise HTTPException(409, 'Only current drafts can be refined')
            return dict(draft=dict(message), vendor=dict(find(state['vendors'], message['vendor_id'])))
        data = transaction(wedding_id, x_wedding_token, context)
        if agent is None:
            raise HTTPException(503, 'AI is not configured; generated rule-based drafts still work')
        try:
            content = await agent.draft_coordination(data)
        except APITimeoutError:
            raise HTTPException(504, 'AI timed out; draft unchanged')
        except (APIError, ValueError):
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

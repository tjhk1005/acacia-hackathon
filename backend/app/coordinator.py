"""Evidence-backed coordination with simulation and manual WhatsApp handoffs."""
import json
from datetime import datetime, timedelta, timezone
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Header, HTTPException
from pydantic import Field, AwareDatetime
from openai import APIError, APITimeoutError
from anthropic import APIError as ClaudeAPIError, APITimeoutError as ClaudeTimeoutError

from .models import Model
from .vendor_research import VendorEvidence, EvidenceExtract, Selection, Enquiry, report
from .store import now
from .scheduling import review_token, reconcile, queue_reminder


class Vendor(Model):
    name: str = Field(min_length=1, max_length=200)
    category: Literal['dress', 'catering', 'emcee', 'flowers', 'venue', 'accommodation']
    channel: Literal['whatsapp', 'telegram']
    contact: str = Field(min_length=1, max_length=200)


class GroupConnection(Model):
    group_name: str = Field(min_length=1, max_length=200)
    participants_informed: bool


class Handoff(Model):
    review_token: str = Field(min_length=64, max_length=64)
    sent_by_user: bool


class Task(Model):
    vendor_id: str
    title: str = Field(min_length=1, max_length=300)
    due_at: AwareDatetime
    reminder_hours: int = Field(default=24, ge=1, le=168)
    automatic_reminders: bool = True


class TaskCompletion(Model):
    done: bool


class Reply(Model):
    content: str = Field(min_length=1, max_length=4000)
    availability: Literal['unknown', 'available', 'unavailable'] = 'unknown'


class Approval(Model):
    review_token: str = Field(min_length=64, max_length=64)


class Run(Model):
    reminder_hours: int = Field(default=24, ge=1, le=168)


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
            reconcile(state, wedding)
            result = operation(state, wedding)
            summary = dict(total=len(state['tasks']), completed=sum(t['done'] for t in state['tasks']), remaining=sum(not t['done'] for t in state['tasks']))
            if isinstance(result, dict) and 'tasks' in result:
                result['checklist'] = summary
            for message in state['messages']:
                if message['direction'] == 'outgoing':
                    message['review_token'] = review_token(message)
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
            content=text, direction='outgoing', status='draft', transport=vendor.get('transport', 'simulation'), group_name=vendor.get('group_name'), brief_revision=wedding['revision'], created_at=now()))

    @router.get('')
    def overview(wedding_id: str, x_wedding_token: str = Header(default='')):
        return transaction(wedding_id, x_wedding_token, lambda state, _: dict(state, mode='manual_whatsapp' if any(v.get('transport') == 'manual_whatsapp' for v in state['vendors']) else 'simulation'))

    @router.get('/report')
    def comparison_report(wedding_id: str, x_wedding_token: str = Header(default='')):
        return transaction(wedding_id, x_wedding_token, report)

    @router.post('/vendors/{vendor_id}/enquiry')
    def vendor_enquiry(wedding_id: str, vendor_id: str, body: Enquiry, x_wedding_token: str = Header(default='')):
        def operation(state, wedding):
            vendor = find(state['vendors'], vendor_id)
            brief = json.loads(wedding['brief'])
            import hashlib
            key = 'research:' + vendor_id + ':' + str(wedding['revision']) + ':' + hashlib.sha256(body.requirements.encode()).hexdigest() + ':' + str(sum(r['vendor_id'] == vendor_id for r in state.get('vendor_evidence', [])))
            draft(state, wedding, vendor, key,
                f"Hello {vendor['name']}, we are researching options for a wedding on {brief['date'] or 'a date to be decided'} in {brief['location'] or 'a location to be decided'}. Please share availability for that date, available stock or capacity, package/item options, itemised prices and currency, units, taxes, additional fees, inclusions, exclusions, quote expiry and booking conditions. Requirements: {body.requirements or 'Please describe your available options.'} This is an information enquiry only, not a reservation, booking, purchase or payment commitment.")
            return dict(state)
        return transaction(wedding_id, x_wedding_token, operation)

    @router.post('/vendors/{vendor_id}/evidence', status_code=201)
    def record_evidence(wedding_id: str, vendor_id: str, body: VendorEvidence, x_wedding_token: str = Header(default='')):
        def operation(state, wedding):
            find(state['vendors'], vendor_id)
            evidence = dict(body.model_dump(), id=str(uuid4()), vendor_id=vendor_id, brief_revision=wedding['revision'], created_at=now(), source='manually_recorded_vendor_reply')
            state.setdefault('vendor_evidence', []).append(evidence)
            for pending in state['messages']:
                if pending['vendor_id'] == vendor_id and pending.get('key', '').startswith(('research:', 'availability:')) and pending['status'] in ('draft', 'ready_to_share'):
                    pending['status'] = 'cancelled'
            state['messages'].append(dict(id=evidence['id'], vendor_id=vendor_id, content=body.content, direction='incoming', status='recorded_reply', created_at=evidence['created_at']))
            return evidence
        return transaction(wedding_id, x_wedding_token, operation)

    @router.post('/vendors/{vendor_id}/evidence/{response_id}/summarize')
    async def summarize_evidence(wedding_id: str, vendor_id: str, response_id: str, x_wedding_token: str = Header(default='')):
        def context(state, wedding):
            evidence = find(state.get('vendor_evidence', []), response_id)
            if evidence['vendor_id'] != vendor_id:
                raise HTTPException(404, 'Vendor response not found')
            if evidence['brief_revision'] != wedding['revision']:
                raise HTTPException(409, 'Wedding changed; ask the vendor for an updated response')
            return dict(evidence)
        original = transaction(wedding_id, x_wedding_token, context)
        if agent is None:
            raise HTTPException(503, 'AI is not configured. You can record exact excerpts manually.')
        try:
            extracted = await agent.summarize_vendor(original['content'])
            validated = VendorEvidence(content=original['content'], **extracted.model_dump())
        except (APITimeoutError, ClaudeTimeoutError):
            raise HTTPException(504, 'AI timed out; evidence unchanged')
        except (APIError, ClaudeAPIError, ValueError):
            raise HTTPException(502, 'AI returned unsupported facts; evidence unchanged')
        def save(state, wedding):
            current = find(state.get('vendor_evidence', []), response_id)
            if current != original or current['brief_revision'] != wedding['revision']:
                raise HTTPException(409, 'Response or wedding changed; refresh before summarizing')
            current.update(validated.model_dump())
            return current
        return transaction(wedding_id, x_wedding_token, save)

    @router.post('/user-selection', status_code=201)
    def user_selection(wedding_id: str, body: Selection, x_wedding_token: str = Header(default='')):
        def operation(state, wedding):
            find(state['vendors'], body.vendor_id)
            if body.report_token != report(state, wedding)['report_token']:
                raise HTTPException(409, 'Vendor report changed; review the latest information before choosing')
            evidence = find(state.get('vendor_evidence', []), body.response_id)
            if evidence['vendor_id'] != body.vendor_id or evidence['brief_revision'] != wedding['revision']:
                raise HTTPException(409, 'Choose a current response from this vendor')
            choice = dict(body.model_dump(), id=str(uuid4()), created_at=now(), selected_by='user', status='user_choice_only', booking_confirmed=False, payment_handled=False)
            # Keep user decision history; the coordinator never selects a winner.
            state.setdefault('user_selections', []).append(choice)
            return choice
        return transaction(wedding_id, x_wedding_token, operation)

    @router.post('/vendors', status_code=201)
    def add_vendor(wedding_id: str, body: Vendor, x_wedding_token: str = Header(default='')):
        def operation(state, wedding):
            vendor = dict(body.model_dump(), id=str(uuid4()), availability='unknown', evidence_id=None, availability_revision=None)
            state['vendors'].append(vendor)
            return vendor
        return transaction(wedding_id, x_wedding_token, operation)

    @router.post('/vendors/{vendor_id}/whatsapp-group')
    def group_connection(wedding_id: str, vendor_id: str, body: GroupConnection, x_wedding_token: str = Header(default='')):
        if not body.participants_informed:
            raise HTTPException(422, 'Inform the group participants before sharing their messages with the coordinator')
        def operation(state, wedding):
            vendor = find(state['vendors'], vendor_id)
            if vendor['channel'] != 'whatsapp':
                raise HTTPException(422, 'Choose a WhatsApp vendor')
            vendor.update(transport='manual_whatsapp', group_name=body.group_name)
            # Existing approvals were for a different delivery route. Require review again.
            for message in state['messages']:
                if message['vendor_id'] == vendor_id and message['status'] in ('draft', 'scheduled', 'ready_to_share'):
                    message.update(status='draft', transport='manual_whatsapp', group_name=body.group_name)
                    message.pop('approved_token', None)
            return vendor
        return transaction(wedding_id, x_wedding_token, operation)

    @router.post('/messages/{message_id}/record-handoff')
    def record_handoff(wedding_id: str, message_id: str, body: Handoff, x_wedding_token: str = Header(default='')):
        def operation(state, wedding):
            message = find(state['messages'], message_id)
            if not body.sent_by_user or message['status'] not in ('ready_to_share', 'manually_sent'):
                raise HTTPException(409, 'Only a message ready for sharing can be recorded as manually sent')
            if body.review_token != review_token(message):
                raise HTTPException(409, 'Message changed; review it again')
            message.update(status='manually_sent', handoff_recorded_at=now())
            return message
        return transaction(wedding_id, x_wedding_token, operation)

    @router.post('/tasks', status_code=201)
    def add_task(wedding_id: str, body: Task, x_wedding_token: str = Header(default='')):
        def operation(state, wedding):
            find(state['vendors'], body.vendor_id)
            task = dict(body.model_dump(mode='json'), id=str(uuid4()), done=False)
            task['remind_at'] = (body.due_at - timedelta(hours=body.reminder_hours)).isoformat()
            state['tasks'].append(task)
            queue_reminder(state, wedding, task)
            return task
        return transaction(wedding_id, x_wedding_token, operation)

    def set_completion(wedding_id, task_id, done, token):
        def operation(state, wedding):
            task = find(state['tasks'], task_id)
            if task['done'] == done:
                return task
            task['done'] = done
            task['completed_at'] = now() if done else None
            if done:
                for message in state['messages']:
                    if message.get('task_id') == task_id or message.get('key', '').startswith('reminder:' + task_id + ':'):
                        if message['status'] in ('draft', 'scheduled', 'ready_to_share'):
                            message['status'] = 'cancelled'
            else:
                task['reminder_generation'] = task.get('reminder_generation', 0) + 1
                queue_reminder(state, wedding, task)
            return task
        return transaction(wedding_id, token, operation)

    @router.patch('/tasks/{task_id}')
    def update_completion(wedding_id: str, task_id: str, body: TaskCompletion, x_wedding_token: str = Header(default='')):
        return set_completion(wedding_id, task_id, body.done, x_wedding_token)

    @router.post('/tasks/{task_id}/complete')
    def complete(wedding_id: str, task_id: str, x_wedding_token: str = Header(default='')):
        return set_completion(wedding_id, task_id, True, x_wedding_token)

    @router.post('/vendors/{vendor_id}/replies', status_code=201)
    def reply(wedding_id: str, vendor_id: str, body: Reply, x_wedding_token: str = Header(default='')):
        def operation(state, wedding):
            vendor = find(state['vendors'], vendor_id)
            message = dict(id=str(uuid4()), vendor_id=vendor_id, content=body.content, direction='incoming', status='recorded_reply' if vendor.get('transport') == 'manual_whatsapp' else 'simulated', created_at=now())
            state['messages'].append(message)
            state.setdefault('vendor_evidence', []).append(dict(id=message['id'], vendor_id=vendor_id, content=body.content, availability_detail=body.content if body.availability != 'unknown' else None, stock_detail=None, pricing_detail=None, options_detail=None, conditions_detail=None, brief_revision=wedding['revision'], created_at=message['created_at'], source='manually_recorded_vendor_reply'))
            # Availability is explicitly annotated by the user; free text is never treated as authority.
            vendor.update(availability=body.availability, evidence_id=message['id'], availability_revision=wedding['revision'])
            if body.availability != 'unknown':
                for pending in state['messages']:
                    if pending.get('key', '').startswith('availability:' + vendor_id + ':') and pending['status'] in ('draft', 'ready_to_share'):
                        pending['status'] = 'cancelled'
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
                queue_reminder(state, wedding, task)
            return dict(state, mode='manual_whatsapp' if any(v.get('transport') == 'manual_whatsapp' for v in state['vendors']) else 'simulation', note='Drafts require approval. WhatsApp group sharing is manual; no external messages are sent automatically.')
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

    @router.post('/messages/{message_id}/cancel')
    def cancel(wedding_id: str, message_id: str, x_wedding_token: str = Header(default='')):
        def operation(state, wedding):
            message = find(state['messages'], message_id)
            if message['status'] not in ('draft', 'scheduled', 'ready_to_share', 'cancelled'):
                raise HTTPException(409, 'Delivered messages cannot be cancelled')
            message['status'] = 'cancelled'
            return message
        return transaction(wedding_id, x_wedding_token, operation)

    @router.post('/messages/{message_id}/approve')
    def approve(wedding_id: str, message_id: str, body: Approval, x_wedding_token: str = Header(default='')):
        def operation(state, wedding):
            message = find(state['messages'], message_id)
            if message['direction'] != 'outgoing' or message['status'] == 'cancelled':
                raise HTTPException(409, 'Only outgoing drafts can be approved')
            if message['brief_revision'] != wedding['revision']:
                raise HTTPException(409, 'Wedding changed; review and generate current drafts')
            if body.review_token != review_token(message):
                raise HTTPException(409, 'Message wording or schedule changed. Review the latest message before approving.')
            if message['status'] in ('scheduled', 'simulated', 'ready_to_share', 'manually_sent'):
                return message
            message['approved_token'] = body.review_token
            message['approved_at'] = now()
            message['status'] = 'scheduled' if message.get('scheduled_at') else ('ready_to_share' if message.get('transport') == 'manual_whatsapp' else 'simulated')
            return message
        return transaction(wedding_id, x_wedding_token, operation)

    return router

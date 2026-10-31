"""Persisted catch-up inbox and explicit, revision-checked schedule decisions."""
import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import List
from uuid import UUID, uuid4

from fastapi import APIRouter, Header, HTTPException
from pydantic import AwareDatetime, Field, field_validator

from .models import Model
from .store import now


class ScheduleChange(Model):
    task_id: str
    expected_task_revision: int = Field(ge=0)
    brief_revision: int = Field(ge=0)
    title: str = Field(min_length=1, max_length=300)
    due_at: AwareDatetime
    reason: str = Field(min_length=1, max_length=1000)
    request_id: UUID

    @field_validator('title', 'reason')
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError('Enter a value')
        return value.strip()


class ScheduleDecision(Model):
    brief_revision: int = Field(ge=0)
    expected_task_revision: int = Field(ge=0)


class ReadUpdates(Model):
    ids: List[UUID] = Field(min_length=1, max_length=100)


def snapshot(task):
    return {key: task[key] for key in ('id', 'vendor_id', 'title', 'due_at', 'done')} | {'revision': task.get('revision', 0)}


def notify(db, wedding_id, key, kind, title, detail, change_id=None):
    db.execute('''INSERT OR IGNORE INTO schedule_notifications
        (id,wedding_id,event_key,kind,title,detail,change_id,created_at) VALUES(?,?,?,?,?,?,?,?)''',
        (str(uuid4()), wedding_id, key, kind, title, detail, change_id, now()))


def notify_vendor_review(db, wedding, vendor):
    reason = vendor.get('decision_reason') or 'Review this vendor conversation before proceeding.'
    digest = hashlib.sha256((reason + str(wedding['revision']) + str(vendor.get('evidence_id'))).encode()).hexdigest()
    notify(db, wedding['id'], 'vendor:' + vendor['id'] + ':' + digest, 'vendor_review',
           vendor['name'] + ' needs your decision', reason)


def record_schedule_updates(db, wedding, previous, state):
    """Runs in the same transaction as every coordinator or messaging write."""
    old = {task['id']: task for task in previous.get('tasks', [])}
    vendors = {vendor['id']: vendor for vendor in state['vendors']}
    for task in state['tasks']:
        before = old.get(task['id'])
        if before == task:
            continue
        kind = 'schedule_added' if before is None else 'schedule_completed' if task['done'] else 'schedule_updated'
        heading = 'Deliverable added' if before is None else 'Deliverable completed' if task['done'] else 'Schedule updated'
        digest = hashlib.sha256(json.dumps(snapshot(task), sort_keys=True).encode()).hexdigest()
        notify(db, wedding['id'], f"task:{task['id']}:{digest}", kind, heading,
               f"{task['title']} · {vendors.get(task['vendor_id'], {}).get('name', 'Vendor')} · {task['due_at']}")
    old_vendors = {vendor['id']: vendor for vendor in previous.get('vendors', [])}
    for vendor in state['vendors']:
        before = old_vendors.get(vendor['id'], {})
        if vendor.get('needs_user_decision') and (not before.get('needs_user_decision') or before.get('decision_reason') != vendor.get('decision_reason')):
            notify_vendor_review(db, wedding, vendor)


def current_change(change, wedding, state):
    task = next((task for task in state['tasks'] if task['id'] == change['task_id']), None)
    vendor = next((vendor for vendor in state['vendors'] if task and vendor['id'] == task['vendor_id']), None)
    return (task is not None and not task['done'] and vendor and vendor.get('active', True)
            and wedding['revision'] == change['brief_revision']
            and snapshot(task) == json.loads(change['before_json']))


def refresh_updates(db, wedding, state):
    timestamp = datetime.now(timezone.utc)
    vendors = {vendor['id']: vendor for vendor in state['vendors']}
    for vendor in state['vendors']:
        if vendor.get('active', True) and vendor.get('needs_user_decision'):
            notify_vendor_review(db, wedding, vendor)
    for task in state['tasks']:
        if task['done'] or not vendors.get(task['vendor_id'], {}).get('active', True):
            continue
        due = datetime.fromisoformat(task['due_at'].replace('Z', '+00:00'))
        phase = 'overdue' if due <= timestamp else 'due_soon' if due <= timestamp + timedelta(hours=72) else None
        if phase:
            notify(db, wedding['id'], f"deadline:{task['id']}:{task.get('revision', 0)}:{task['due_at']}:{phase}", phase,
                   'Deadline overdue' if phase == 'overdue' else 'Deadline approaching',
                   f"{task['title']} · due {task['due_at']}. Review the schedule if the vendor needs more time.")
    for change in db.execute("SELECT * FROM schedule_changes WHERE wedding_id=? AND status='pending'", (wedding['id'],)).fetchall():
        if not current_change(change, wedding, state):
            db.execute("UPDATE schedule_changes SET status='stale',decided_at=? WHERE id=?", (now(), change['id']))
            notify(db, wedding['id'], 'stale:' + change['id'], 'change_stale', 'Schedule proposal needs a fresh review',
                   'The brief, deliverable or vendor changed. Create a fresh proposal from the current schedule.', change['id'])


def inbox(db, wedding_id):
    pending = db.execute("SELECT COUNT(*) FROM schedule_changes WHERE wedding_id=? AND status='pending'", (wedding_id,)).fetchone()[0]
    unread = db.execute('SELECT COUNT(*) FROM schedule_notifications WHERE wedding_id=? AND read_at IS NULL', (wedding_id,)).fetchone()[0]
    rows = db.execute('''SELECT n.*,c.status AS change_status,c.before_json,c.after_json,c.reason,c.brief_revision
        FROM schedule_notifications n LEFT JOIN schedule_changes c ON n.change_id=c.id
        WHERE n.wedding_id=?
        ORDER BY COALESCE(c.status='pending',0) DESC, (n.read_at IS NULL) DESC, n.created_at DESC, n.id DESC LIMIT 100''', (wedding_id,)).fetchall()
    notifications = []
    for row in rows:
        item = {key: row[key] for key in ('id', 'kind', 'title', 'detail', 'created_at', 'read_at')}
        if row['change_id']:
            item['change'] = {'id': row['change_id'], 'status': row['change_status'], 'before': json.loads(row['before_json']),
                              'after': json.loads(row['after_json']), 'reason': row['reason'], 'brief_revision': row['brief_revision']}
        notifications.append(item)
    return {'notifications': notifications, 'unread_count': unread, 'pending_count': pending}


def schedule_router(store):
    from .coordinator import load_coordination, save_coordination
    router = APIRouter(prefix='/api/weddings/{wedding_id}/schedule', tags=['schedule'])

    def transaction(wedding_id, token, action):
        store.get(wedding_id, token)
        with store.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            wedding = db.execute('SELECT * FROM weddings WHERE id=?', (wedding_id,)).fetchone()
            state = load_coordination(db, wedding)
            result = action(db, wedding, state)
            return result

    @router.get('')
    def updates(wedding_id: str, x_wedding_token: str = Header(default='')):
        def action(db, wedding, state):
            refresh_updates(db, wedding, state)
            return inbox(db, wedding_id)
        return transaction(wedding_id, x_wedding_token, action)

    @router.post('/read')
    def mark_read(wedding_id: str, body: ReadUpdates, x_wedding_token: str = Header(default='')):
        def action(db, wedding, state):
            for identifier in body.ids:
                db.execute('UPDATE schedule_notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND wedding_id=?', (now(), str(identifier), wedding_id))
            refresh_updates(db, wedding, state)
            return inbox(db, wedding_id)
        return transaction(wedding_id, x_wedding_token, action)

    @router.post('/changes', status_code=201)
    def propose(wedding_id: str, body: ScheduleChange, x_wedding_token: str = Header(default='')):
        payload = body.model_dump(mode='json')
        digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        def action(db, wedding, state):
            replay = db.execute('SELECT * FROM schedule_changes WHERE wedding_id=? AND request_id=?', (wedding_id, str(body.request_id))).fetchone()
            if replay:
                if replay['payload_hash'] != digest:
                    raise HTTPException(409, 'This request ID was already used for a different proposal')
                return {'change_id': replay['id'], 'status': replay['status']}
            task = next((task for task in state['tasks'] if task['id'] == body.task_id), None)
            if task is None:
                raise HTTPException(404, 'Deliverable not found')
            vendor = next(vendor for vendor in state['vendors'] if vendor['id'] == task['vendor_id'])
            if wedding['revision'] != body.brief_revision or task.get('revision', 0) != body.expected_task_revision:
                raise HTTPException(409, 'The brief or schedule changed. Refresh before proposing a change.')
            if task['done'] or not vendor.get('active', True):
                raise HTTPException(409, 'Only an active, incomplete deliverable can be rescheduled')
            before = snapshot(task)
            after = {**before, 'title': body.title, 'due_at': body.due_at.astimezone(timezone.utc).isoformat()}
            if before['title'] == after['title'] and datetime.fromisoformat(before['due_at'].replace('Z', '+00:00')) == body.due_at:
                raise HTTPException(422, 'Propose a different title or deadline')
            if db.execute("SELECT COUNT(*) FROM schedule_changes WHERE wedding_id=? AND status='pending'", (wedding_id,)).fetchone()[0] >= 100:
                raise HTTPException(422, 'Review the existing pending proposals before creating more')
            identifier = str(uuid4())
            db.execute('''INSERT INTO schedule_changes
                (id,wedding_id,request_id,payload_hash,task_id,brief_revision,before_json,after_json,reason,created_at)
                VALUES(?,?,?,?,?,?,?,?,?,?)''', (identifier, wedding_id, str(body.request_id), digest, task['id'], wedding['revision'], json.dumps(before), json.dumps(after), body.reason, now()))
            notify(db, wedding_id, 'proposal:' + identifier, 'approval_requested', 'Schedule change needs your approval',
                   vendor['name'] + ' · ' + body.title, identifier)
            return {'change_id': identifier, 'status': 'pending'}
        return transaction(wedding_id, x_wedding_token, action)

    @router.post('/changes/{change_id}/{decision}')
    def decide(wedding_id: str, change_id: str, decision: str, body: ScheduleDecision, x_wedding_token: str = Header(default='')):
        if decision not in {'approve', 'reject'}:
            raise HTTPException(404, 'Decision not found')
        desired = 'approved' if decision == 'approve' else 'rejected'
        def action(db, wedding, state):
            change = db.execute('SELECT * FROM schedule_changes WHERE id=? AND wedding_id=?', (change_id, wedding_id)).fetchone()
            if not change:
                raise HTTPException(404, 'Schedule proposal not found')
            if change['status'] == desired:
                return inbox(db, wedding_id)  # Repeated clicks never apply the change twice.
            if change['status'] != 'pending':
                raise HTTPException(409, 'This proposal has already been decided or replaced')
            before = json.loads(change['before_json'])
            if body.brief_revision != change['brief_revision'] or body.expected_task_revision != before['revision']:
                raise HTTPException(409, 'Review the exact proposal before deciding')
            if desired == 'approved':
                if not current_change(change, wedding, state):
                    raise HTTPException(409, 'The schedule or brief changed. Review a fresh proposal.')
                task = next(task for task in state['tasks'] if task['id'] == change['task_id'])
                after = json.loads(change['after_json'])
                task.update(title=after['title'], due_at=after['due_at'], revision=before['revision'] + 1)
                # A reminder for the old time must not survive an approved reschedule.
                for message in state['messages']:
                    if message.get('key', '').startswith('reminder:' + task['id'] + ':') and message['status'] in {'draft', 'queued', 'waiting_window'}:
                        message['status'] = 'cancelled'
                        db.execute("UPDATE live_outbox SET status='cancelled',error='The approved deadline changed.' WHERE message_id=? AND status IN ('queued','waiting_window')", (message['id'],))
                save_coordination(db, wedding_id, state)
            db.execute('UPDATE schedule_changes SET status=?,decided_at=? WHERE id=?', (desired, now(), change_id))
            db.execute('UPDATE schedule_notifications SET read_at=COALESCE(read_at,?) WHERE change_id=?', (now(), change_id))
            notify(db, wedding_id, desired + ':' + change_id, 'change_' + desired,
                   'Schedule change ' + desired, json.loads(change['after_json'])['title'], change_id)
            refresh_updates(db, wedding, state)
            return inbox(db, wedding_id)
        return transaction(wedding_id, x_wedding_token, action)

    return router

"""Persistent reminders: automatic task templates, reviewed availability enquiries."""
import hashlib
import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo


def timestamp(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def review_token(message):
    fields = {key: message.get(key) for key in ('id', 'content', 'scheduled_at', 'brief_revision', 'vendor_id', 'transport', 'group_name')}
    return hashlib.sha256(json.dumps(fields, sort_keys=True).encode()).hexdigest()


def reconcile(state, wedding):
    for task in state['tasks']:
        if not task.get('remind_at'):
            task['remind_at'] = (timestamp(task['due_at']) - timedelta(hours=24)).isoformat()
    for message in state['messages']:
        if message['status'] == 'draft' and message.get('key', '').startswith('reminder:'):
            task = next((t for t in state['tasks'] if message['key'].startswith('reminder:' + t['id'] + ':')), None)
            if task:
                message.setdefault('task_id', task['id'])
                message.setdefault('scheduled_at', task['remind_at'])
    for vendor in state['vendors']:
        if vendor['availability_revision'] != wedding['revision']:
            vendor.update(availability='unknown', evidence_id=None)
    for message in state['messages']:
        if message['status'] in ('draft', 'scheduled', 'ready_to_share') and message['brief_revision'] != wedding['revision']:
            message['status'] = 'cancelled'


def queue_reminder(state, wedding, task):
    if task['done']:
        return
    task.setdefault('automatic_reminders', True)
    key = f"reminder:{task['id']}:{wedding['revision']}"
    if task.get('reminder_generation', 0):
        key += ':' + str(task['reminder_generation'])
    existing = next((m for m in state['messages'] if m.get('key') == key), None)
    if existing:
        if existing['status'] == 'draft' and task['automatic_reminders'] and not existing.get('ai_assisted'):
            existing.update(status='scheduled', automation='task_reminder')
            existing['automation_token'] = review_token(existing)
        return
    vendor = next(v for v in state['vendors'] if v['id'] == task['vendor_id'])
    deadline = timestamp(task['due_at']).astimezone(ZoneInfo('Asia/Singapore')).strftime('%d %b %Y, %I:%M %p SGT')
    message = dict(id=str(uuid4()), vendor_id=vendor['id'], task_id=task['id'], key=key,
        content=f"Hello {vendor['name']}, reminder: {task['title']} is due {deadline}. Please share an update or flag any delay.",
        direction='outgoing', status='draft', transport=vendor.get('transport', 'simulation'), group_name=vendor.get('group_name'), brief_revision=wedding['revision'],
        scheduled_at=task['remind_at'], created_at=datetime.now(timezone.utc).isoformat())
    if task['automatic_reminders']:
        message.update(status='scheduled', automation='task_reminder')
        message['automation_token'] = review_token(message)
    state['messages'].append(message)


def scheduler_tick(store, current=None):
    current = current or datetime.now(timezone.utc)
    with store.connection() as db:
        db.execute('BEGIN IMMEDIATE')
        rows = db.execute('SELECT c.wedding_id,c.state,w.revision FROM coordination c JOIN weddings w ON w.id=c.wedding_id').fetchall()
        for row in rows:
            state = json.loads(row['state'])
            reconcile(state, row)
            for task in state['tasks']:
                if task.get('remind_at'):
                    queue_reminder(state, row, task)
            for message in state['messages']:
                if message['status'] != 'scheduled':
                    continue
                task = next((t for t in state['tasks'] if t['id'] == message.get('task_id')), None)
                if task and task['done']:
                    message['status'] = 'cancelled'
                elif not ((task and task.get('automatic_reminders', True) and message.get('automation') == 'task_reminder' and message.get('automation_token') == review_token(message)) or message.get('approved_token') == review_token(message)):
                    message['status'] = 'draft'
                elif timestamp(message['scheduled_at']) <= current:
                    if message.get('transport') == 'manual_whatsapp':
                        message.update(status='ready_to_share', ready_at=current.isoformat())
                    else:
                        message.update(status='simulated', delivered_at=current.isoformat())
            db.execute('UPDATE coordination SET state=? WHERE wedding_id=?', (json.dumps(state), row['wedding_id']))

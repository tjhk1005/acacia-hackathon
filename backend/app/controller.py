"""Persisted, bounded planning controller over the existing specialist tools."""
import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import List, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException
from pydantic import Field

from .coordinator import load_coordination, prepare_drafts, save_coordination
from .models import Model, WeddingBrief, WeddingView
from .planning import missing_fields, serialize_wedding
from .vendors import VendorCriteria, compare


def utc_now():
    return datetime.now(timezone.utc)


class ControllerRun(Model):
    expected_revision: int = Field(ge=0)
    brief_revision: int = Field(ge=0)
    input_version: str = Field(pattern=r"^[0-9a-f]{64}$")
    request_id: UUID


class Assignment(Model):
    key: str
    agent: Literal['couple', 'vendor_communication', 'vendor_comparison', 'coordinator']
    title: str
    detail: str
    status: Literal['ready', 'completed', 'blocked', 'needs_clarification', 'needs_user_decision', 'waiting_for_vendor']
    priority: int
    depends_on: List[str] = Field(default_factory=list)
    evidence_ids: List[str] = Field(default_factory=list)
    action_href: str
    brief_revision: int


class ControllerView(Model):
    wedding: WeddingView
    revision: int
    input_version: str
    needs_run: bool
    last_run_at: Optional[str]
    tasks: List[Assignment]
    next_action: Optional[Assignment]
    counts: dict
    coordination: dict
    activity: List[dict]
    mode: Literal['simulation'] = 'simulation'


def inputs(db, wedding, timestamp):
    row = db.execute('SELECT * FROM vendor_selections WHERE wedding_id=?', (wedding['id'],)).fetchone()
    selection = dict(row) if row else {'revision': 0, 'criteria': '{}', 'shortlisted_ids': '[]', 'reviewed_brief_revision': None}
    coordination = load_coordination(db, wedding)
    phases = {}
    for task in coordination['tasks']:
        due = datetime.fromisoformat(task['due_at'].replace('Z', '+00:00'))
        phases[task['id']] = 'completed' if task['done'] else 'overdue' if due <= timestamp else 'due_soon' if due <= timestamp + timedelta(hours=72) else 'scheduled'
    version = hashlib.sha256(json.dumps({
        'brief_revision': wedding['revision'], 'selection': selection,
        'coordination': coordination, 'deadline_phases': phases,
    }, sort_keys=True).encode()).hexdigest()
    return selection, coordination, phases, version


def assignments(wedding, selection, coordination, phases):
    brief = WeddingBrief.model_validate_json(wedding['brief'])
    missing = missing_fields(brief)
    confirmed = not missing and wedding['status'] == 'confirmed'
    criteria = VendorCriteria.model_validate_json(selection['criteria'])
    results = compare(brief, criteria)
    matched = {item.vendor.id for item in results if item.matches}
    shortlisted = json.loads(selection['shortlisted_ids'])
    filters_reviewed = selection['reviewed_brief_revision'] == wedding['revision']
    filters_ready = filters_reviewed and bool(matched)
    vendors = [vendor for vendor in coordination['vendors'] if vendor.get('active', True)]
    drafts = [message for message in coordination['messages'] if message['status'] == 'draft']
    unavailable = [vendor for vendor in vendors if vendor['availability'] == 'unavailable']
    unknown = [vendor for vendor in vendors if vendor['availability'] == 'unknown']
    tasks = []

    def task(key, agent, title, detail, status, priority, href, depends=(), evidence=()):
        tasks.append(Assignment(key=key, agent=agent, title=title, detail=detail, status=status,
                                priority=priority, action_href=href, depends_on=list(depends),
                                evidence_ids=list(evidence), brief_revision=wedding['revision']))

    task('brief', 'couple', 'Complete the wedding brief',
         'Still needed: ' + ', '.join(missing) + '.' if missing else 'Names, location, guest count and overall budget are recorded.',
         'needs_clarification' if missing else 'completed', 10, '/planner')
    task('confirmation', 'couple', 'Review and confirm the brief',
         'Confirm your saved details before the controller prepares vendor enquiries.' if not confirmed else 'The couple has confirmed this version of the brief.',
         'blocked' if missing else 'completed' if confirmed else 'needs_user_decision', 15, '/planner', ['brief'])
    task('catering-filters', 'vendor_comparison', 'Review catering requirements',
         'Apply your catering budget, menu and service filters to the latest brief.' if not filters_reviewed else
         'No sample package meets all the saved filters. Choose which constraint could change; the controller will not relax it for you.' if not matched else
         f'{len(matched)} fictional packages meet the saved hard filters. Real availability and aesthetic fit are not verified.',
         'blocked' if missing else 'completed' if filters_ready else 'needs_user_decision', 45, '/vendors', ['brief'])
    valid_shortlist = bool(shortlisted) and all(identifier in matched for identifier in shortlisted)
    task('shortlist', 'vendor_comparison', 'Build a feasible catering shortlist',
         'The saved sample shortlist fits the selected filters.' if valid_shortlist and filters_ready else
         'Some saved packages no longer fit. Review their constraints before proceeding.' if shortlisted else
         'Save up to three fictional packages to understand the price and inclusion trade-offs.',
         'blocked' if not filters_ready else 'completed' if valid_shortlist else 'needs_user_decision', 50, '/vendors', ['catering-filters'], shortlisted)
    task('contacts', 'vendor_communication', 'Add vendor contacts for the simulation',
         f'{len(vendors)} manually entered vendor contacts. These are separate from the fictional catalogue.' if vendors else
         'Add a vendor you want to simulate contacting. Sample packages never become real contacts automatically.',
         'completed' if vendors else 'ready' if confirmed else 'blocked', 55, '/controller#vendor-desk', ['confirmation'])

    if not vendors:
        availability_status, availability_detail = 'blocked', 'Add a contact before preparing an availability enquiry.'
    elif not brief.date:
        availability_status, availability_detail = 'needs_clarification', 'Choose a tentative wedding date in your planner so an enquiry can ask about a specific day.'
    elif unavailable:
        availability_status = 'needs_user_decision'
        availability_detail = 'Unavailable in the simulated replies: ' + ', '.join(vendor['name'] for vendor in unavailable) + '. Choose an alternative vendor or revise the plan; no date or booking is changed automatically.'
    elif not unknown:
        availability_status, availability_detail = 'completed', 'Availability has been explicitly annotated from simulated replies. This is not a booking or a verified quotation.'
    elif not confirmed:
        availability_status, availability_detail = 'blocked', 'Review and confirm the latest brief before preparing new enquiries.'
    else:
        keys = {message.get('key'): message for message in coordination['messages'] if message['status'] != 'cancelled'}
        awaiting = [keys.get(f"availability:{vendor['id']}:{wedding['revision']}") for vendor in unknown]
        availability_status = 'ready' if any(message is None for message in awaiting) else 'needs_user_decision' if any(message['status'] == 'draft' for message in awaiting) else 'waiting_for_vendor'
        availability_detail = 'Run the controller to prepare the missing enquiries.' if availability_status == 'ready' else 'Review the availability drafts below.' if availability_status == 'needs_user_decision' else 'Record a simulated reply below. No real messages have been sent.'
    task('availability', 'vendor_communication', 'Resolve vendor availability', availability_detail,
         availability_status, 20 if unavailable else 35 if vendors and not brief.date else 65,
         '/planner' if vendors and not brief.date else '/controller#vendor-desk', ['contacts'],
         [vendor['evidence_id'] for vendor in vendors if vendor['evidence_id']])
    if drafts:
        task('review-drafts', 'vendor_communication', 'Review prepared messages',
             f'{len(drafts)} drafts await review. Approval records simulated delivery only.',
             'needs_user_decision' if confirmed else 'blocked', 30, '/controller#drafts', ['confirmation'], [message['id'] for message in drafts])
    task('quote-evidence', 'vendor_comparison', 'Collect itemised quote evidence',
         'Real quotation extraction and comparison are not connected yet. Availability annotations and sample catalogue estimates cannot stand in for supplier prices, fees, expiry or booking evidence.',
         'blocked', 90, '/controller#vendor-desk', ['availability'])
    by_id = {vendor['id']: vendor for vendor in vendors}
    for deliverable in coordination['tasks']:
        vendor = by_id.get(deliverable['vendor_id'])
        if vendor is None:
            continue
        phase = phases[deliverable['id']]
        conflict = vendor and vendor['availability'] == 'unavailable' and not deliverable['done']
        task('deadline:' + deliverable['id'], 'coordinator', deliverable['title'],
             f"{vendor['name'] if vendor else 'Vendor'} · due {deliverable['due_at']}. " +
             ('Marked complete by the user.' if deliverable['done'] else 'Vendor unavailable; review the deliverable.' if conflict else
              'Overdue; a user decision or vendor update is needed.' if phase == 'overdue' else
              'Within 72 hours. The controller can prepare a reminder for a confirmed brief.' if phase == 'due_soon' else 'Scheduled for a later date.'),
             'completed' if deliverable['done'] else 'needs_user_decision' if conflict or phase == 'overdue' else 'waiting_for_vendor',
             25 if conflict or phase == 'overdue' else 75, '/controller#deadlines', ['contacts'], [deliverable['id']])
    return sorted(tasks, key=lambda item: (item.priority, item.key))


def view(db, wedding, timestamp):
    selection, coordination, phases, version = inputs(db, wedding, timestamp)
    row = db.execute('SELECT * FROM controller_state WHERE wedding_id=?', (wedding['id'],)).fetchone()
    snapshot = json.loads(row['snapshot']) if row else None
    tasks = assignments(wedding, selection, coordination, phases)
    complete = not missing_fields(WeddingBrief.model_validate_json(wedding['brief'])) and wedding['status'] == 'confirmed'
    # Probe a copy: GET diagnoses pending work but never creates drafts or writes state.
    pending_drafts = bool(prepare_drafts(json.loads(json.dumps(coordination)), wedding, timestamp=timestamp, limit=1)) if complete else False
    active_ids = {vendor['id'] for vendor in coordination['vendors'] if vendor.get('active', True)}
    activity = [dict(event) for event in db.execute(
        'SELECT id,kind,title,brief_revision,created_at FROM controller_events WHERE wedding_id=? ORDER BY id DESC LIMIT 30',
        (wedding['id'],)).fetchall()]
    return ControllerView(
        wedding=serialize_wedding(wedding), revision=row['revision'] if row else 0,
        input_version=version, needs_run=snapshot is None or snapshot['input_version'] != version or pending_drafts,
        last_run_at=snapshot['last_run_at'] if snapshot else None, tasks=tasks,
        next_action=next((task for task in tasks if task.status not in {'completed', 'blocked'}), None),
        counts={'vendors': sum(vendor.get('active', True) for vendor in coordination['vendors']),
                'drafts': sum(message['status'] == 'draft' for message in coordination['messages']),
                'overdue': sum(phases[task['id']] == 'overdue' and task['vendor_id'] in active_ids for task in coordination['tasks']),
                'completed_steps': sum(task.status == 'completed' for task in tasks)},
        coordination=coordination, activity=activity,
    )


def controller_router(store):
    router = APIRouter(prefix='/api/weddings/{wedding_id}/controller', tags=['controller'])
    with store.connection() as db:
        db.executescript('''
            CREATE TABLE IF NOT EXISTS controller_state (
                wedding_id TEXT PRIMARY KEY REFERENCES weddings(id), revision INTEGER NOT NULL, snapshot TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS controller_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT, wedding_id TEXT NOT NULL REFERENCES weddings(id),
                kind TEXT NOT NULL, title TEXT NOT NULL, brief_revision INTEGER NOT NULL, created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS controller_events_wedding ON controller_events(wedding_id,id);
        ''')

    @router.get('', response_model=ControllerView)
    def overview(wedding_id: str, x_wedding_token: str = Header(default='')):
        store.get(wedding_id, x_wedding_token)
        with store.connection() as db:
            db.execute('BEGIN')
            wedding = db.execute('SELECT * FROM weddings WHERE id=?', (wedding_id,)).fetchone()
            return view(db, wedding, utc_now())

    @router.post('/run', response_model=ControllerView)
    def run(wedding_id: str, body: ControllerRun, x_wedding_token: str = Header(default='')):
        store.get(wedding_id, x_wedding_token)
        payload_hash = hashlib.sha256(('controller:' + body.model_dump_json()).encode()).hexdigest()
        with store.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            saved = db.execute('SELECT * FROM requests WHERE wedding_id=? AND request_id=?', (wedding_id, str(body.request_id))).fetchone()
            if saved:
                if saved['payload_hash'] != payload_hash:
                    raise HTTPException(409, 'request_id has already been used with different input')
                return json.loads(saved['response'])
            wedding = db.execute('SELECT * FROM weddings WHERE id=?', (wedding_id,)).fetchone()
            timestamp = utc_now()
            before = view(db, wedding, timestamp)
            if body.expected_revision != before.revision or body.brief_revision != wedding['revision'] or body.input_version != before.input_version:
                raise HTTPException(409, 'Planning inputs changed. Refresh the controller before running it again.')
            _, coordination, _, _ = inputs(db, wedding, timestamp)
            created = prepare_drafts(coordination, wedding, timestamp=timestamp) if wedding['status'] == 'confirmed' and not before.wedding.missing_fields else []
            save_coordination(db, wedding_id, coordination)
            after = view(db, wedding, timestamp)
            changed = before.needs_run
            revision = before.revision + int(changed)
            snapshot = {'tasks': [task.model_dump() for task in after.tasks], 'input_version': after.input_version, 'last_run_at': timestamp.isoformat()}
            db.execute('INSERT INTO controller_state VALUES(?,?,?) ON CONFLICT(wedding_id) DO UPDATE SET revision=excluded.revision,snapshot=excluded.snapshot',
                       (wedding_id, revision, json.dumps(snapshot)))
            if changed:
                db.execute('INSERT INTO controller_events(wedding_id,kind,title,brief_revision,created_at) VALUES(?,?,?,?,?)',
                           (wedding_id, 'plan_checked', f'Planning steps checked; {len(created)} message drafts prepared.', wedding['revision'], timestamp.isoformat()))
            for message in created:
                vendor = next(vendor for vendor in coordination['vendors'] if vendor['id'] == message['vendor_id'])
                db.execute('INSERT INTO controller_events(wedding_id,kind,title,brief_revision,created_at) VALUES(?,?,?,?,?)',
                           (wedding_id, 'draft_prepared', f"Draft prepared for {vendor['name']}.", wedding['revision'], timestamp.isoformat()))
            result = view(db, wedding, timestamp)
            db.execute('INSERT INTO requests VALUES(?,?,?,?)', (wedding_id, str(body.request_id), payload_hash, result.model_dump_json()))
            return result

    return router

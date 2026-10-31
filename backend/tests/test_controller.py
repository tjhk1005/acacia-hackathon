from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import app.controller as controller
from app.main import create_app
from app.models import PreferenceFields, PreferenceResult


class Agent:
    calls = 0

    async def extract(self, *args):
        self.calls += 1
        return PreferenceResult(updates=PreferenceFields(), reply="You're welcome.", questions=[])


@pytest.fixture
def context(tmp_path):
    path = tmp_path / 'controller.sqlite'
    agent = Agent()
    with TestClient(create_app(path, agent=agent)) as client:
        created = client.post('/api/weddings', json={'brief': {
            'names': 'Demo couple', 'guests': '80', 'budget': '20000',
            'location': 'Singapore', 'date': '2027-08-08',
        }}).json()
        root = '/api/weddings/' + created['wedding']['id']
        headers = {'X-Wedding-Token': created['access_token']}
        yield client, root, headers, path, agent


def overview(context):
    client, root, headers, *_ = context
    response = client.get(root + '/controller', headers=headers)
    assert response.status_code == 200
    return response.json()


def body(state):
    return {'expected_revision': state['revision'], 'brief_revision': state['wedding']['revision'],
            'input_version': state['input_version'], 'request_id': str(uuid4())}


def run(context):
    client, root, headers, *_ = context
    response = client.post(root + '/controller/run', headers=headers, json=body(overview(context)))
    assert response.status_code == 200
    return response.json()


def confirm(context):
    client, root, headers, *_ = context
    revision = overview(context)['wedding']['revision']
    assert client.post(root + '/confirm', headers=headers, json={'expected_revision': revision}).status_code == 200


def add_vendor(context, name='Sample caterer'):
    client, root, headers, *_ = context
    response = client.post(root + '/coordination/vendors', headers=headers, json={
        'name': name, 'category': 'catering', 'channel': 'whatsapp', 'contact': 'fictional-reference',
    })
    assert response.status_code == 201
    return response.json()


def assignment(state, key):
    return next(task for task in state['tasks'] if task['key'] == key)


def test_missing_details_gate_outreach_and_read_does_not_create_records(context):
    client, root, headers, path, agent = context
    created = client.post('/api/weddings', json={}).json()
    other = '/api/weddings/' + created['wedding']['id']
    h = {'X-Wedding-Token': created['access_token']}
    assert client.get(other + '/controller').status_code == 404
    state = client.get(other + '/controller', headers=h).json()
    assert state['next_action']['key'] == 'brief'
    assert state['next_action']['status'] == 'needs_clarification'
    assert state['revision'] == 0 and state['activity'] == [] and state['last_run_at'] is None
    assert client.get(other + '/controller', headers=h).json() == state
    assert client.post(other + '/controller/run', headers=headers, json=body(state)).status_code == 404
    assert client.post(other + '/controller/run', headers=h, json={}).status_code == 422
    saved = client.post(other + '/controller/run', headers=h, json=body(state)).json()
    assert saved['counts']['drafts'] == 0
    assert saved['needs_run'] is False
    assert agent.calls == 0


def test_confirmed_brief_gates_draft_tool_and_retries_are_atomic(context):
    client, root, headers, path, agent = context
    vendor = add_vendor(context)
    initial = run(context)
    assert initial['counts']['drafts'] == 0
    assert assignment(initial, 'confirmation')['status'] == 'needs_user_decision'
    confirm(context)
    request = body(overview(context))
    response = client.post(root + '/controller/run', headers=headers, json=request)
    assert response.status_code == 200
    saved = response.json()
    assert saved['mode'] == 'simulation'
    assert saved['counts']['drafts'] == 1
    assert saved['coordination']['messages'][0]['vendor_id'] == vendor['id']
    assert saved['coordination']['messages'][0]['status'] == 'draft'
    assert saved['needs_run'] is False
    assert client.post(root + '/controller/run', headers=headers, json=request).json() == saved
    repeated = run(context)
    assert repeated['revision'] == saved['revision']
    assert repeated['activity'] == saved['activity']
    assert repeated['coordination'] == saved['coordination']
    assert agent.calls == 0
    keys = {task['key'] for task in repeated['tasks']}
    assert all(set(task['depends_on']) <= keys for task in repeated['tasks'])
    with TestClient(create_app(path, agent=Agent())) as restarted:
        restored = restarted.get(root + '/controller', headers=headers).json()
        assert restored['activity'] == saved['activity']
        assert restored['counts']['drafts'] == 1
        assert restored['revision'] == saved['revision']


def test_controller_and_legacy_coordinator_share_idempotent_draft_tool(context):
    client, root, headers, *_ = context
    confirm(context)
    add_vendor(context)
    assert client.post(root + '/coordination/run', headers=headers, json={}).status_code == 200
    state = run(context)
    assert state['counts']['drafts'] == 1
    assert client.post(root + '/coordination/run', headers=headers, json={}).json()['messages'] == state['coordination']['messages']


def test_source_changes_and_changed_request_ids_are_rejected(context):
    client, root, headers, *_ = context
    confirm(context)
    state = overview(context)
    stale = body(state)
    add_vendor(context)
    assert client.post(root + '/controller/run', headers=headers, json=stale).status_code == 409
    request = body(overview(context))
    saved = client.post(root + '/controller/run', headers=headers, json=request).json()
    assert client.post(root + '/controller/run', headers=headers, json={**request, 'expected_revision': saved['revision']}).status_code == 409
    revision = saved['wedding']['revision']
    assert client.patch(root, headers=headers, json={'expected_revision': revision, 'brief': {'date': '2027-09-09'}}).status_code == 200
    changed = overview(context)
    assert changed['needs_run'] is True
    assert all(message['status'] == 'cancelled' for message in changed['coordination']['messages'])
    assert client.post(root + '/controller/run', headers=headers, json=body(saved)).status_code == 409
    assert client.post(root + '/controller/run', headers=headers, json=request).json() == saved
    current = run(context)
    assert current['counts']['drafts'] == 0  # Revised brief needs confirmation again.


def test_unchanged_chat_does_not_stale_the_controller(context):
    client, root, headers, *_ = context
    confirm(context)
    add_vendor(context)
    saved = run(context)
    chat = client.post(root + '/chat', headers=headers, json={
        'message': 'Thanks', 'expected_revision': saved['wedding']['revision'], 'request_id': str(uuid4()),
    })
    assert chat.status_code == 200
    current = overview(context)
    assert current['needs_run'] is False
    assert current['input_version'] == saved['input_version']
    assert current['activity'] == saved['activity']


def test_date_unknown_and_infeasible_samples_stay_explicit(context):
    client, root, headers, *_ = context
    assert client.patch(root, headers=headers, json={'expected_revision': 0, 'brief': {'date': ''}}).status_code == 200
    confirm(context)
    add_vendor(context)
    revision = overview(context)['wedding']['revision']
    assert client.patch(root + '/vendors', headers=headers, json={
        'expected_revision': 0, 'brief_revision': revision,
        'criteria': {'catering_budget': '1', 'dietary_requirements': ['halal', 'vegan']},
    }).status_code == 200
    state = run(context)
    assert assignment(state, 'catering-filters')['status'] == 'needs_user_decision'
    assert 'No sample package' in assignment(state, 'catering-filters')['detail']
    assert assignment(state, 'availability')['status'] == 'needs_clarification'
    assert state['counts']['drafts'] == 0
    assert state['wedding']['brief']['budget'] == '20000'
    assert assignment(state, 'quote-evidence')['status'] == 'blocked'


def test_draft_limit_can_be_drained_without_duplicate_messages(context):
    client, root, headers, *_ = context
    confirm(context)
    for index in range(25):
        add_vendor(context, f'Example {index}')
    request = body(overview(context))
    first = client.post(root + '/controller/run', headers=headers, json=request).json()
    assert first['counts']['drafts'] == 20 and first['needs_run'] is True
    assert client.post(root + '/controller/run', headers=headers, json=request).json() == first
    second = run(context)
    assert second['counts']['drafts'] == 25 and second['needs_run'] is False
    assert len({message['key'] for message in second['coordination']['messages']}) == 25
    assert run(context)['counts']['drafts'] == 25


def test_deadline_crossings_refresh_plan_and_completion_cancels_reminders(context, monkeypatch):
    client, root, headers, *_ = context
    timestamp = datetime(2027, 1, 1, tzinfo=timezone.utc)
    monkeypatch.setattr(controller, 'utc_now', lambda: timestamp)
    confirm(context)
    vendor = add_vendor(context)
    client.post(root + '/coordination/vendors/' + vendor['id'] + '/replies', headers=headers,
                json={'content': 'Available', 'availability': 'available'})
    deliverable = client.post(root + '/coordination/tasks', headers=headers, json={
        'vendor_id': vendor['id'], 'title': 'Final menu', 'due_at': (timestamp + timedelta(hours=73)).isoformat(),
    }).json()
    first = run(context)
    assert first['counts']['drafts'] == 0
    stale = body(first)
    timestamp += timedelta(hours=2)
    assert client.post(root + '/controller/run', headers=headers, json=stale).status_code == 409
    soon = run(context)
    assert soon['counts']['drafts'] == 1
    timestamp += timedelta(hours=72)
    overdue = overview(context)
    assert overdue['counts']['overdue'] == 1
    assert assignment(overdue, 'deadline:' + deliverable['id'])['status'] == 'needs_user_decision'
    assert run(context)['counts']['drafts'] == 1
    assert client.post(root + '/coordination/tasks/' + deliverable['id'] + '/complete', headers=headers, json={}).status_code == 200
    complete = run(context)
    assert complete['counts']['overdue'] == 0 and complete['counts']['drafts'] == 0
    assert assignment(complete, 'deadline:' + deliverable['id'])['status'] == 'completed'


def test_unavailable_vendor_can_be_excluded_and_reconsidered_without_erasing_evidence(context):
    client, root, headers, *_ = context
    confirm(context)
    vendor = add_vendor(context)
    first = run(context)
    message_id = first['coordination']['messages'][0]['id']
    path = root + '/coordination/vendors/' + vendor['id']
    revision = first['wedding']['revision']
    assert client.post(path + '/replies', headers=headers, json={'content': 'Unavailable', 'availability': 'unavailable', 'brief_revision': revision - 1}).status_code == 409
    assert client.post(path + '/replies', headers=headers, json={'content': 'Unavailable', 'availability': 'unavailable', 'brief_revision': revision}).status_code == 201
    conflicted = run(context)
    assert assignment(conflicted, 'availability')['status'] == 'needs_user_decision'
    assert client.post(path + '/participation', headers=headers, json={'active': False}).status_code == 200
    excluded = run(context)
    assert excluded['counts']['vendors'] == 0 and excluded['counts']['drafts'] == 0
    assert excluded['coordination']['vendors'][0]['availability'] == 'unavailable'
    assert any(message['direction'] == 'incoming' for message in excluded['coordination']['messages'])
    assert client.post(root + '/coordination/messages/' + message_id + '/approve', headers=headers, json={}).status_code == 409
    assert client.post(path + '/participation', headers=headers, json={'active': True}).status_code == 200
    reconsidered = run(context)
    assert reconsidered['counts']['drafts'] == 1
    assert reconsidered['coordination']['vendors'][0]['availability'] == 'unknown'
    assert reconsidered['coordination']['messages'][-1]['id'] != message_id

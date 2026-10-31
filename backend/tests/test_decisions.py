from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import app.controller as controller
from app.main import create_app


@pytest.fixture
def context(tmp_path):
    path = tmp_path / 'decisions.sqlite'
    with TestClient(create_app(path, agent=object())) as client:
        created = client.post('/api/weddings', json={}).json()
        root = '/api/weddings/' + created['wedding']['id']
        headers = {'X-Wedding-Token': created['access_token']}
        yield client, root, headers, path


def decision_body(**changes):
    return {'request_id': str(uuid4()), 'title': 'Choose our dinner menu', 'detail': 'Review the vegetarian options together.', **changes}


def test_decision_retries_are_idempotent_and_changes_are_revision_checked(context):
    client, root, headers, path = context
    body = decision_body(due_at=(datetime.now(timezone.utc) - timedelta(hours=1)).isoformat())
    created = client.post(root + '/controller/decisions', headers=headers, json=body)
    assert created.status_code == 201
    decision = created.json()
    assert 'payload_hash' not in decision and 'wedding_id' not in decision
    assert client.post(root + '/controller/decisions', headers=headers, json=body).json() == decision
    assert client.post(root + '/controller/decisions', headers=headers, json={**body, 'title': 'Different decision'}).status_code == 409
    before = client.get(root + '/controller', headers=headers).json()
    assert len(before['decisions']) == 1 and before['counts']['overdue_decisions'] == 1
    assert len(before['activity']) == 1
    url = root + '/controller/decisions/' + decision['id']
    complete = client.patch(url, headers=headers, json={'expected_revision': 0, 'done': True}).json()
    assert complete['revision'] == 1 and complete['completed_at']
    after = client.get(root + '/controller', headers=headers).json()
    assert after['counts']['overdue_decisions'] == 0
    assert after['wedding']['revision'] == before['wedding']['revision']
    assert client.patch(url, headers=headers, json={'expected_revision': 1, 'done': True}).json() == complete
    assert len(client.get(root + '/controller', headers=headers).json()['activity']) == 2
    assert client.patch(url, headers=headers, json={'expected_revision': 0, 'done': False}).status_code == 409
    reopened = client.patch(url, headers=headers, json={'expected_revision': 1, 'done': False}).json()
    assert not reopened['done'] and reopened['revision'] == 2
    with TestClient(create_app(path, agent=object())) as restarted:
        restored = restarted.get(root + '/controller', headers=headers).json()
        assert restored['decisions'] == [reopened]


def test_approaching_deadlines_change_attention_without_writing_on_get(context, monkeypatch):
    client, root, headers, _ = context
    now = datetime(2030, 1, 1, tzinfo=timezone.utc)
    monkeypatch.setattr(controller, 'utc_now', lambda: now)
    item = client.post(root + '/controller/decisions', headers=headers, json=decision_body(due_at=(now + timedelta(days=4)).isoformat())).json()
    initial = client.get(root + '/controller', headers=headers).json()
    task_key = 'decision:' + item['id']
    assert next(task for task in initial['tasks'] if task['key'] == task_key)['status'] == 'ready'
    now += timedelta(days=2)
    soon = client.get(root + '/controller', headers=headers).json()
    assert soon['input_version'] != initial['input_version']
    assert next(task for task in soon['tasks'] if task['key'] == task_key)['status'] == 'needs_user_decision'
    now += timedelta(days=3)
    overdue = client.get(root + '/controller', headers=headers).json()
    assert overdue['counts']['overdue_decisions'] == 1
    assert overdue['revision'] == initial['revision']
    assert overdue['activity'] == initial['activity']


def test_new_decision_invalidates_a_pending_controller_run(context):
    client, root, headers, _ = context
    state = client.get(root + '/controller', headers=headers).json()
    client.post(root + '/controller/decisions', headers=headers, json=decision_body())
    response = client.post(root + '/controller/run', headers=headers, json={
        'expected_revision': state['revision'], 'brief_revision': state['wedding']['revision'],
        'input_version': state['input_version'], 'request_id': str(uuid4()),
    })
    assert response.status_code == 409
    assert client.get(root + '/controller', headers=headers).json()['counts']['drafts'] == 0


def test_private_weddings_cannot_read_or_change_each_others_decisions(context):
    client, root, headers, _ = context
    decision = client.post(root + '/controller/decisions', headers=headers, json=decision_body()).json()
    other = client.post('/api/weddings', json={}).json()
    other_headers = {'X-Wedding-Token': other['access_token']}
    assert client.post(root + '/controller/decisions', headers=other_headers, json=decision_body()).status_code == 404
    assert client.get(root + '/controller', headers=other_headers).status_code == 404
    other_root = '/api/weddings/' + other['wedding']['id']
    assert client.patch(other_root + '/controller/decisions/' + decision['id'], headers=other_headers, json={'expected_revision': 0, 'done': True}).status_code == 404


@pytest.mark.parametrize('change', [{'title': '   '}, {'due_at': 'not-a-date'}, {'due_at': '2030-01-01T12:00:00'}, {'send_whatsapp': True}])
def test_invalid_decisions_do_not_mutate_schedule(context, change):
    client, root, headers, _ = context
    assert client.post(root + '/controller/decisions', headers=headers, json=decision_body(**change)).status_code == 422
    assert client.get(root + '/controller', headers=headers).json()['decisions'] == []

import json
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.models import PreferenceFields, PreferenceResult

PROFILE = json.loads((Path(__file__).resolve().parents[2] / 'tests/fixtures/personality-v3.json').read_text())


class Agent:
    received = None

    async def extract(self, brief, history, message):
        self.received = brief.personality.model_dump()
        return PreferenceResult(updates=PreferenceFields(guests='120'), reply='Updated your guest count.', questions=[])

    async def draft_coordination(self, context):
        self.received = context['wedding_brief']['personality']
        return context['draft']['content']


def test_latest_quiz_survives_chat_manual_edits_comparison_and_restart(tmp_path):
    path = tmp_path / 'personality.sqlite'
    agent = Agent()
    with TestClient(create_app(path, agent=agent)) as client:
        response = client.post('/api/weddings', json={'brief': {
            'personality': PROFILE, 'names': 'Test couple', 'guests': '80',
            'budget': '20000', 'location': 'Singapore', 'date': '2027-08-08',
        }})
        assert response.status_code == 201
        created = response.json()
        root = '/api/weddings/' + created['wedding']['id']
        headers = {'X-Wedding-Token': created['access_token']}
        assert created['wedding']['brief']['personality'] == PROFILE
        assert created['wedding']['brief']['style'] == ''
        chat = client.post(root + '/chat', headers=headers, json={
            'message': 'Make that 120 guests', 'expected_revision': 0, 'request_id': str(uuid4()),
        })
        assert chat.status_code == 200
        assert agent.received == PROFILE
        assert chat.json()['wedding']['brief']['personality'] == PROFILE
        changed = client.patch(root, headers=headers, json={'expected_revision': 1, 'brief': {'decor': {'lighting': 'Warm lamps'}}})
        assert changed.status_code == 200
        assert changed.json()['wedding']['brief']['personality'] == PROFILE
        assert client.get(root + '/vendors', headers=headers).json()['wedding']['brief']['personality'] == PROFILE
        vendor = client.post(root + '/coordination/vendors', headers=headers, json={'name': 'Demo florist', 'category': 'flowers', 'channel': 'whatsapp', 'contact': 'manual-demo'}).json()
        assert vendor['id']
        draft = client.post(root + '/coordination/run', headers=headers, json={}).json()['messages'][0]
        assert client.post(root + '/coordination/messages/' + draft['id'] + '/refine', headers=headers, json={}).status_code == 200
        assert agent.received == PROFILE
    with TestClient(create_app(path, agent=agent)) as restarted:
        saved = restarted.get(root, headers=headers).json()['wedding']['brief']
        assert saved['personality'] == PROFILE
        assert saved['guests'] == '120'


def test_quiz_sync_is_revision_checked_and_resets_confirmation(tmp_path):
    with TestClient(create_app(tmp_path / 'sync.sqlite', agent=Agent())) as client:
        created = client.post('/api/weddings', json={'brief': {'personality': PROFILE, 'names': 'Test couple', 'location': 'Singapore', 'guests': '80', 'budget': '20000'}}).json()
        root = '/api/weddings/' + created['wedding']['id']
        headers = {'X-Wedding-Token': created['access_token']}
        assert client.post(root + '/confirm', headers=headers, json={'expected_revision': 0}).status_code == 200
        updated = {**PROFILE, 'words': 'More colourful, with an indoor option'}
        assert client.patch(root, headers=headers, json={'expected_revision': 0, 'brief': {'personality': updated}}).status_code == 409
        saved = client.patch(root, headers=headers, json={'expected_revision': 1, 'brief': {'personality': updated}}).json()['wedding']
        assert saved['status'] == 'draft'
        assert saved['brief']['personality'] == updated


@pytest.mark.parametrize('change', [{'version': 2}, {'feelings': PROFILE['worlds']}, {'worlds': []}])
def test_invalid_personality_is_rejected_without_creating_a_wedding(tmp_path, change):
    with TestClient(create_app(tmp_path / 'invalid.sqlite', agent=Agent())) as client:
        assert client.post('/api/weddings', json={'brief': {'personality': {**PROFILE, **change}}}).status_code == 422


def test_ai_patch_schema_cannot_replace_quiz_choices():
    assert 'personality' not in PreferenceResult.model_json_schema()['$defs']['PreferenceFields']['properties']

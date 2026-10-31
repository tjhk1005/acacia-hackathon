from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from openai import APIConnectionError, APITimeoutError
import httpx

from app.main import create_app
from app.models import BriefPatch, PreferenceResult


class FakeAgent:
    def __init__(self):
        self.calls = 0
        self.history = None
        self.result = PreferenceResult(
            updates=BriefPatch(guests="80", budget="6000", notes="Halal catering required."),
            reply="I've recorded 80 guests, S$6,000 overall and halal catering. Where will the wedding be?",
            questions=["Where will the wedding be?"],
        )

    async def extract(self, brief, history, message):
        self.calls += 1
        self.history = history
        return self.result


@pytest.fixture
def setup(tmp_path):
    agent = FakeAgent()
    app = create_app(tmp_path / "test.sqlite3", agent=agent)
    with TestClient(app) as client:
        created = client.post("/api/weddings", json={}).json()
        wedding_id = created["wedding"]["id"]
        headers = {"X-Wedding-Token": created["access_token"]}
        yield client, agent, wedding_id, headers


def test_manual_create_edit_confirm_and_reset(setup):
    client, _, wedding_id, headers = setup
    url = f"/api/weddings/{wedding_id}"
    assert client.get(url).status_code == 404
    assert client.get(url, headers={"X-Wedding-Token": "wrong"}).status_code == 404
    initial = client.get(url, headers=headers).json()["wedding"]
    assert initial["missing_fields"] == ["names", "location", "guests", "budget"]
    assert client.post(url + "/confirm", headers=headers, json={"expected_revision": 0}).status_code == 422
    response = client.patch(url, headers=headers, json={"expected_revision": 0, "brief": {
        "names": "Alex & Sam", "location": "Singapore", "guests": "80", "budget": "20000.01",
        "notes": "Halal food", "priorities": ["Beautiful food"],
    }})
    assert response.status_code == 200
    wedding = response.json()["wedding"]
    assert wedding["budget_summary"]["per_guest"] == "250.00"
    assert wedding["missing_fields"] == []
    assert client.post(url + "/confirm", headers=headers, json={"expected_revision": 1}).json()["wedding"]["status"] == "confirmed"
    assert client.patch(url, headers=headers, json={"expected_revision": 0, "brief": {"guests": "99"}}).status_code == 409
    updated = client.patch(url, headers=headers, json={"expected_revision": 2, "brief": {"guests": "100"}}).json()["wedding"]
    assert updated["status"] == "draft"
    assert updated["brief"]["notes"] == "Halal food"
    assert updated["brief"]["priorities"] == ["Beautiful food"]
    assert updated["budget_summary"]["per_guest"] == "200.00"


@pytest.mark.parametrize("patch", [
    {"guests": "0"}, {"guests": "2.5"}, {"guests": "-1"}, {"guests": "eighty"},
    {"budget": "NaN"}, {"budget": "Infinity"}, {"budget": "0"}, {"budget": "-5"},
    {"budget": "5.999"}, {"date": "2026-02-30"}, {"style": "made up"},
    {"priorities": [""]}, {"unknown_field": "value"}, {"names": None, "guests": 80},
])
def test_invalid_input_rejected_without_mutation(setup, patch):
    client, _, wedding_id, headers = setup
    url = f"/api/weddings/{wedding_id}"
    assert client.patch(url, headers=headers, json={"expected_revision": 0, "brief": patch}).status_code == 422
    assert client.get(url, headers=headers).json()["wedding"]["revision"] == 0


def test_chat_atomic_history_idempotency_and_context(setup):
    client, agent, wedding_id, headers = setup
    url = f"/api/weddings/{wedding_id}"
    body = {"message": "80 guests, total budget S$6000, halal food", "expected_revision": 0, "request_id": str(uuid4())}
    first = client.post(url + "/chat", headers=headers, json=body)
    assert first.status_code == 200
    result = first.json()
    assert result["changed_fields"] == ["guests", "budget", "notes"]
    assert result["wedding"]["budget_summary"]["per_guest"] == "75.00"
    assert client.post(url + "/chat", headers=headers, json=body).json() == result
    assert agent.calls == 1
    assert len(client.get(url + "/messages", headers=headers).json()["messages"]) == 2
    assert client.post(url + "/chat", headers=headers, json={**body, "message": "changed"}).status_code == 409
    assert client.post(url + "/chat", headers=headers, json={**body, "request_id": str(uuid4())}).status_code == 409
    agent.result = PreferenceResult(updates=BriefPatch(guests="100"), reply="Updated to 100 guests.", questions=[])
    second = client.post(url + "/chat", headers=headers, json={**body, "message": "Actually 100 guests", "expected_revision": 1, "request_id": str(uuid4())})
    assert second.status_code == 200
    assert len(agent.history) == 2
    assert second.json()["wedding"]["brief"]["notes"] == "Halal catering required."
    assert second.json()["wedding"]["budget_summary"]["per_guest"] == "60.00"


def test_clear_values_and_fixed_date_requirement(setup):
    client, _, wedding_id, headers = setup
    url = f"/api/weddings/{wedding_id}"
    first = client.patch(url, headers=headers, json={"expected_revision": 0, "brief": {"notes": "Keep", "guests": "80", "flexibleDate": False}}).json()["wedding"]
    assert "date" in first["missing_fields"]
    second = client.patch(url, headers=headers, json={"expected_revision": 1, "brief": {"notes": None, "guests": "", "priorities": []}}).json()["wedding"]
    assert second["brief"]["notes"] == "Keep"
    assert second["brief"]["guests"] == ""


def test_database_survives_app_restart(tmp_path):
    path = tmp_path / "persistent.sqlite3"
    with TestClient(create_app(path, agent=FakeAgent())) as first:
        created = first.post("/api/weddings", json={"brief": {"names": "Alex & Sam"}}).json()
    with TestClient(create_app(path, agent=FakeAgent())) as second:
        response = second.get(f'/api/weddings/{created["wedding"]["id"]}', headers={"X-Wedding-Token": created["access_token"]})
        assert response.json()["wedding"]["brief"]["names"] == "Alex & Sam"


def test_tiny_per_guest_budget_is_zero_not_unknown(setup):
    client, _, _, _ = setup
    created = client.post("/api/weddings", json={"brief": {"budget": "0.01", "guests": "10000"}}).json()
    assert created["wedding"]["budget_summary"]["per_guest"] == "0.00"


def test_token_cannot_access_another_wedding(setup):
    client, _, _, headers = setup
    other = client.post("/api/weddings", json={}).json()["wedding"]["id"]
    assert client.get(f"/api/weddings/{other}", headers=headers).status_code == 404


def test_unconfigured_ai_keeps_manual_editing(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with TestClient(create_app(tmp_path / "no-key.sqlite3")) as client:
        assert client.get("/health").json()["ai_configured"] is False
        created = client.post("/api/weddings", json={}).json()
        url = f'/api/weddings/{created["wedding"]["id"]}'
        headers = {"X-Wedding-Token": created["access_token"]}
        response = client.post(url + "/chat", headers=headers, json={"message": "hello", "expected_revision": 0, "request_id": str(uuid4())})
        assert response.status_code == 503
        assert client.get(url + "/messages", headers=headers).json() == {"messages": []}
        assert client.patch(url, headers=headers, json={"expected_revision": 0, "brief": {"guests": "80"}}).status_code == 200


@pytest.mark.parametrize("error,expected", [(ValueError("invalid"), 502),
    (APITimeoutError(request=httpx.Request("POST", "https://example.test")), 504),
    (APIConnectionError(request=httpx.Request("POST", "https://example.test")), 502)])
def test_ai_failures_do_not_save_partial_turn(setup, error, expected):
    client, agent, wedding_id, headers = setup
    async def fail(*args):
        raise error
    agent.extract = fail
    url = f"/api/weddings/{wedding_id}"
    response = client.post(url + "/chat", headers=headers, json={"message": "80 guests", "expected_revision": 0, "request_id": str(uuid4())})
    assert response.status_code == expected
    assert client.get(url, headers=headers).json()["wedding"]["revision"] == 0
    assert client.get(url + "/messages", headers=headers).json() == {"messages": []}


def test_edit_during_ai_call_is_not_overwritten(setup):
    client, agent, wedding_id, headers = setup
    url = f"/api/weddings/{wedding_id}"
    original = agent.extract
    async def competing_edit(*args):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=client.app), base_url="http://test") as concurrent:
            edited = await concurrent.patch(url, headers=headers, json={"expected_revision": 0, "brief": {"guests": "120"}})
            assert edited.status_code == 200
        return await original(*args)
    agent.extract = competing_edit
    response = client.post(url + "/chat", headers=headers, json={"message": "80 guests", "expected_revision": 0, "request_id": str(uuid4())})
    assert response.status_code == 409
    assert client.get(url, headers=headers).json()["wedding"]["brief"]["guests"] == "120"
    assert client.get(url + "/messages", headers=headers).json() == {"messages": []}


def test_cors_allows_frontend_with_token_header(setup):
    client, _, _, _ = setup
    response = client.options("/api/weddings", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,x-wedding-token"})
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    denied = client.options("/api/weddings", headers={"Origin": "https://untrusted.example", "Access-Control-Request-Method": "POST"})
    assert denied.status_code == 400


@pytest.mark.parametrize("style", ["garden", "beach", "classic", "modern", "rustic", "bohemian", "tropical", "intimate"])
def test_visual_website_brief_roundtrip(setup, style):
    client, _, _, _ = setup
    brief = {"names": "Alex & Sam", "style": style, "direction": f"{style}-3",
             "decor": {"florals": "White roses", "lighting": "Candles", "tables": "Round tables"}}
    response = client.post("/api/weddings", json={"brief": brief})
    assert response.status_code == 201
    created = response.json()
    assert created["wedding"]["brief"]["direction"] == f"{style}-3"
    url = f'/api/weddings/{created["wedding"]["id"]}'
    headers = {"X-Wedding-Token": created["access_token"]}
    updated = client.patch(url, headers=headers, json={"expected_revision": 0, "brief": {"decor": {"lighting": "Fairy lights"}}})
    assert updated.json()["wedding"]["brief"]["decor"] == {"florals": "White roses", "lighting": "Fairy lights", "tables": "Round tables"}
    changed = client.patch(url, headers=headers, json={"expected_revision": 1, "brief": {"style": ""}})
    assert changed.json()["wedding"]["brief"]["direction"] == ""


def test_chat_correction_keeps_visual_choices(setup):
    client, agent, wedding_id, headers = setup
    url = f"/api/weddings/{wedding_id}"
    client.patch(url, headers=headers, json={"expected_revision": 0, "brief": {"style": "beach", "direction": "beach-1", "decor": {"florals": "Tropical leaves", "lighting": "Lanterns"}}})
    result = client.post(url + "/chat", headers=headers, json={"message": "80 guests, total budget S$6000", "expected_revision": 1, "request_id": str(uuid4())})
    brief = result.json()["wedding"]["brief"]
    assert brief["direction"] == "beach-1"
    assert brief["decor"]["lighting"] == "Lanterns"


def test_invalid_direction_patch_is_a_validation_error(setup):
    client, _, wedding_id, headers = setup
    response = client.patch(f"/api/weddings/{wedding_id}", headers=headers, json={"expected_revision": 0, "brief": {"style": "garden", "direction": "beach-0"}})
    assert response.status_code == 422


def test_legacy_coastal_brief_migrates_to_beach(setup):
    client, _, _, _ = setup
    result = client.post("/api/weddings", json={"brief": {"style": "coastal"}})
    assert result.json()["wedding"]["brief"]["style"] == "beach"

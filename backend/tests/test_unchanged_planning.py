from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.models import PreferenceFields, PreferenceResult


class UnchangedAgent:
    def __init__(self, updates):
        self.updates = updates
        self.calls = 0

    async def extract(self, *args):
        self.calls += 1
        return PreferenceResult(updates=PreferenceFields(**self.updates), reply="You're welcome.", questions=[])


@pytest.mark.parametrize("updates", [{}, {"guests": "80", "budget": "20000"}])
def test_unchanged_turn_preserves_vendor_work_and_is_replayable(tmp_path, updates):
    agent = UnchangedAgent(updates)
    with TestClient(create_app(tmp_path / "unchanged.sqlite", agent=agent)) as client:
        created = client.post("/api/weddings", json={"brief": {
            "names": "Demo couple", "location": "Singapore", "guests": "80",
            "budget": "20000", "date": "2027-08-08",
        }}).json()
        root = "/api/weddings/" + created["wedding"]["id"]
        headers = {"X-Wedding-Token": created["access_token"]}
        wedding = client.post(root + "/confirm", headers=headers, json={"expected_revision": 0}).json()["wedding"]
        coordination = root + "/coordination"
        vendor = client.post(coordination + "/vendors", headers=headers, json={
            "name": "Sample caterer", "category": "catering", "channel": "whatsapp", "contact": "fictional",
        }).json()
        task = client.post(coordination + "/tasks", headers=headers, json={
            "vendor_id": vendor["id"], "title": "Confirm menu",
            "due_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        })
        assert task.status_code == 201
        drafts = client.post(coordination + "/run", headers=headers, json={}).json()["messages"]
        evidence = client.post(coordination + "/vendors/" + vendor["id"] + "/replies", headers=headers,
                               json={"content": "Available on that date", "availability": "available"}).json()
        selection = client.patch(root + "/vendors", headers=headers, json={
            "expected_revision": 0, "brief_revision": wedding["revision"],
            "criteria": {"catering_budget": "6000"}, "shortlisted_ids": ["saffron-gathering"],
        }).json()
        turn = {"message": "Thanks", "expected_revision": wedding["revision"], "request_id": str(uuid4())}
        response = client.post(root + "/chat", headers=headers, json=turn)
        assert response.status_code == 200
        result = response.json()
        assert result["changed_fields"] == []
        assert result["wedding"] == wedding
        assert client.post(root + "/chat", headers=headers, json=turn).json() == result
        assert agent.calls == 1
        assert len(client.get(root + "/messages", headers=headers).json()["messages"]) == 2
        assert client.post(root + "/chat", headers=headers, json={**turn, "message": "Changed input"}).status_code == 409

        # Re-saving the same details and confirming an already-confirmed brief are also harmless.
        assert client.patch(root, headers=headers, json={"expected_revision": wedding["revision"], "brief": {"guests": "80"}}).json()["wedding"] == wedding
        assert client.post(root + "/confirm", headers=headers, json={"expected_revision": wedding["revision"]}).json()["wedding"] == wedding
        state = client.post(coordination + "/run", headers=headers, json={}).json()
        assert state["vendors"][0]["availability"] == "available"
        assert state["vendors"][0]["evidence_id"] == evidence["id"]
        assert [message for message in state["messages"] if message["direction"] == "outgoing"] == drafts
        assert client.get(root + "/vendors", headers=headers).json() == selection

        # A real date change must still invalidate those records and reject stale writes.
        changed = client.patch(root, headers=headers, json={"expected_revision": wedding["revision"], "brief": {"date": "2027-09-09"}}).json()["wedding"]
        assert changed["revision"] == wedding["revision"] + 1
        assert changed["status"] == "draft"
        state = client.get(coordination, headers=headers).json()
        assert state["vendors"][0]["availability"] == "unknown"
        assert all(message["status"] == "cancelled" for message in state["messages"] if message["direction"] == "outgoing")
        assert client.get(root + "/vendors", headers=headers).json()["needs_review"] is True
        assert client.patch(root, headers=headers, json={"expected_revision": wedding["revision"], "brief": {}}).status_code == 409
        assert client.post(root + "/chat", headers=headers, json=turn).json() == result
        assert len(client.get(root + "/messages", headers=headers).json()["messages"]) == 2

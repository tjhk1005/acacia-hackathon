from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.models import WeddingBrief
from app.vendors import CATALOGUE, VendorCriteria, compare, estimate


class UnusedAgent:
    async def extract(self, *args):
        raise AssertionError("Vendor discovery must not require an AI call")


@pytest.fixture
def context(tmp_path):
    path = tmp_path / "vendors.sqlite3"
    with TestClient(create_app(path, agent=UnusedAgent())) as client:
        created = client.post("/api/weddings", json={"brief": {
            "names": "Alex & Sam", "guests": "80", "budget": "20000", "location": "Singapore", "notes": "Halal food and vegetarian options required."
        }}).json()
        base = f'/api/weddings/{created["wedding"]["id"]}'
        headers = {"X-Wedding-Token": created["access_token"]}
        yield client, path, base, headers


def test_cost_includes_minimum_order_and_all_stated_sample_fees():
    orchard = next(v for v in CATALOGUE if v.id == "orchard-banquet")
    result = estimate(orchard, 80, "6000")
    assert result.guests == 80 and result.billable_guests == 100
    assert result.food_subtotal == "3800.00"
    assert result.delivery_setup == "300.00"
    assert result.tax == "369.00"
    assert result.total == "4469.00"
    assert result.budget_difference == "1531.00"


def test_service_and_tax_calculations_have_exact_decimal_totals():
    saffron = next(v for v in CATALOGUE if v.id == "saffron-gathering")
    result = estimate(saffron, 80, "5000")
    assert result.service_charge == "192.00"
    assert result.tax == "376.38"
    assert result.total == "4558.38"
    assert sum(Decimal(getattr(result, key)) for key in ("food_subtotal", "delivery_setup", "service_charge", "tax")) == Decimal(result.total)


def test_hard_requirements_capacity_and_unpriced_extras():
    brief = WeddingBrief(location="Singapore", guests="80", budget="20000")
    criteria = VendorCriteria(catering_budget="6000", dietary_requirements=["halal", "vegetarian"])
    results = compare(brief, criteria)
    assert [item.vendor.id for item in results if item.matches] == ["saffron-gathering"]
    orchard = next(item for item in results if item.vendor.id == "orchard-banquet")
    assert any("Pricing" in concern for concern in orchard.concerns)
    assert not any("within your catering budget" in reason for reason in orchard.reasons)
    assert all(item.vendor.availability == "unconfirmed" for item in results)


def test_unknown_guest_count_is_not_assumed_and_budget_is_not_all_allocated():
    unknown = compare(WeddingBrief(location="Singapore", budget="20000"), VendorCriteria())
    assert not any(item.matches for item in unknown)
    assert all(item.estimate is None for item in unknown)
    known = compare(WeddingBrief(location="Singapore", guests="80", budget="20000"), VendorCriteria())
    assert all(item.estimate.budget_difference is None for item in known)


def test_service_style_and_location_filter():
    results = compare(WeddingBrief(location="Singapore", guests="80"), VendorCriteria(service_style="plated"))
    assert [item.vendor.id for item in results if item.matches] == ["petal-plate"]
    assert not any(item.matches for item in compare(WeddingBrief(location="Bali", guests="80"), VendorCriteria()))


def test_vendor_selection_is_private_persistent_and_independent_of_brief(context):
    client, path, base, headers = context
    assert client.get(base + "/vendors").status_code == 404
    initial = client.get(base + "/vendors", headers=headers).json()
    assert initial["needs_review"] is True
    assert all(item["vendor"]["source"] == "fictional_sample" for item in initial["results"])
    criteria = {"catering_budget": "6000", "dietary_requirements": ["halal", "vegetarian"], "service_style": "buffet"}
    result = client.patch(base + "/vendors", headers=headers, json={"expected_revision": 0, "brief_revision": 0, "criteria": criteria}).json()
    assert result["needs_review"] is False and result["matched_count"] == 1
    saved = client.patch(base + "/vendors", headers=headers, json={"expected_revision": 1, "brief_revision": 0, "shortlisted_ids": ["saffron-gathering", "olive-thyme"]})
    assert saved.status_code == 200
    assert saved.json()["shortlisted_ids"] == ["saffron-gathering", "olive-thyme"]
    brief = client.get(base, headers=headers).json()["wedding"]
    assert brief["brief"]["budget"] == "20000" and brief["revision"] == 0
    with TestClient(create_app(path, agent=UnusedAgent())) as reopened:
        state = reopened.get(base + "/vendors", headers=headers).json()
        assert state["shortlisted_ids"] == ["saffron-gathering", "olive-thyme"]
        assert state["criteria"]["catering_budget"] == "6000"


@pytest.mark.parametrize("change", [
    {"shortlisted_ids": ["does-not-exist"]},
    {"shortlisted_ids": ["olive-thyme", "olive-thyme"]},
    {"shortlisted_ids": [v.id for v in CATALOGUE[:4]]},
    {"criteria": {"catering_budget": "NaN"}},
    {"criteria": {"catering_budget": "-1"}},
    {"criteria": {"catering_budget": "0"}},
    {"criteria": {"dietary_requirements": ["invented"]}},
])
def test_invalid_selection_or_budget_does_not_mutate_state(context, change):
    client, _, base, headers = context
    result = client.patch(base + "/vendors", headers=headers, json={"expected_revision": 0, "brief_revision": 0, **change})
    assert result.status_code == 422
    assert client.get(base + "/vendors", headers=headers).json()["revision"] == 0


def test_changed_guest_count_recalculates_and_requires_review(context):
    client, _, base, headers = context
    client.patch(base + "/vendors", headers=headers, json={"expected_revision": 0, "brief_revision": 0, "criteria": {"catering_budget": "6000", "dietary_requirements": ["halal", "vegetarian"]}, "shortlisted_ids": ["saffron-gathering"]})
    client.patch(base, headers=headers, json={"expected_revision": 0, "brief": {"guests": "120"}})
    result = client.get(base + "/vendors", headers=headers).json()
    assert result["needs_review"] is True and result["matched_count"] == 0
    assert result["shortlisted_ids"] == ["saffron-gathering"]
    saffron = next(item for item in result["results"] if item["vendor"]["id"] == "saffron-gathering")
    assert saffron["estimate"]["total"] == "6755.82"
    stale = client.patch(base + "/vendors", headers=headers, json={"expected_revision": 1, "brief_revision": 0, "shortlisted_ids": []})
    assert stale.status_code == 409


def test_stale_vendor_revision_cannot_overwrite_saved_choices(context):
    client, _, base, headers = context
    body = {"expected_revision": 0, "brief_revision": 0, "shortlisted_ids": ["olive-thyme"]}
    assert client.patch(base + "/vendors", headers=headers, json=body).status_code == 200
    assert client.patch(base + "/vendors", headers=headers, json={**body, "shortlisted_ids": []}).status_code == 409


def test_another_weddings_token_cannot_read_shortlist(context):
    client, _, base, _ = context
    other = client.post("/api/weddings", json={}).json()
    assert client.get(base + "/vendors", headers={"X-Wedding-Token": other["access_token"]}).status_code == 404

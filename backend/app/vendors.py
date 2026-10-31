"""Fictional catering catalogue and deterministic, transparent comparisons."""
import json
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Literal, Optional

from fastapi import HTTPException
from pydantic import Field, field_validator

from .models import BriefPatch, Model, WeddingBrief, WeddingView
from .planning import serialize_wedding

Diet = Literal["halal", "vegetarian", "vegan"]


class VendorCriteria(Model):
    catering_budget: Optional[str] = Field(default=None, max_length=32)
    dietary_requirements: List[Diet] = Field(default_factory=list, max_length=3)
    service_style: Literal["any", "buffet", "plated"] = "any"

    @field_validator("catering_budget")
    @classmethod
    def valid_budget(cls, value):
        return BriefPatch(budget=value).budget if value else None

    @field_validator("dietary_requirements")
    @classmethod
    def unique_requirements(cls, value):
        return list(dict.fromkeys(value))


class VendorChange(Model):
    expected_revision: int = Field(ge=0)
    brief_revision: int = Field(ge=0)
    criteria: Optional[VendorCriteria] = None
    shortlisted_ids: Optional[List[str]] = Field(default=None, max_length=3)

    @field_validator("shortlisted_ids")
    @classmethod
    def unique_shortlist(cls, value):
        if value is not None and len(value) != len(set(value)):
            raise ValueError("A vendor can only appear once in the shortlist")
        return value


class Vendor(Model):
    id: str
    name: str
    tagline: str
    description: str
    service_style: Literal["buffet", "plated"]
    dietary_support: List[Diet]
    unpriced_dietary_extras: List[Diet] = Field(default_factory=list)
    min_billable_guests: int
    max_guests: int
    per_guest: str
    delivery_setup: str
    service_percent: str
    tax_percent: str
    inclusions: List[str]
    exclusions: List[str]
    service_area: str = "Singapore"
    source: Literal["fictional_sample"] = "fictional_sample"
    availability: Literal["unconfirmed"] = "unconfirmed"


CATALOGUE = [
    Vendor(id="olive-thyme", name="Olive & Thyme", tagline="A generous garden buffet", description="Relaxed sharing dishes, seasonal sides and a softly styled buffet spread.", service_style="buffet", dietary_support=["vegetarian"], min_billable_guests=50, max_guests=200, per_guest="42.00", delivery_setup="180.00", service_percent="0", tax_percent="9", inclusions=["8-course buffet", "Buffet equipment", "2-hour setup window"], exclusions=["Dining tables and chairs", "Beverages", "Service staff"]),
    Vendor(id="saffron-gathering", name="Saffron Gathering", tagline="Celebration, shared by everyone", description="A welcoming buffet with halal and vegetarian menu options in this sample package.", service_style="buffet", dietary_support=["halal", "vegetarian"], min_billable_guests=60, max_guests=300, per_guest="48.00", delivery_setup="150.00", service_percent="5", tax_percent="9", inclusions=["10-course buffet", "Buffet setup", "2 service attendants"], exclusions=["Dining furniture", "Beverages", "Extended service hours"]),
    Vendor(id="gather-grain", name="Gather & Grain", tagline="Plant-led, thoughtfully prepared", description="A colourful plant-based buffet for a gathering with food at its heart.", service_style="buffet", dietary_support=["vegetarian", "vegan"], min_billable_guests=40, max_guests=120, per_guest="55.00", delivery_setup="120.00", service_percent="0", tax_percent="9", inclusions=["Plant-based buffet", "Dessert station", "Reusable serving equipment"], exclusions=["Service staff", "Beverages", "Dining furniture"]),
    Vendor(id="petal-plate", name="Petal & Plate", tagline="A dinner with a little ceremony", description="A plated dinner with coordinated service and delicate presentation.", service_style="plated", dietary_support=["vegetarian"], min_billable_guests=30, max_guests=100, per_guest="88.00", delivery_setup="250.00", service_percent="10", tax_percent="9", inclusions=["4-course plated menu", "Service staff", "Crockery and cutlery"], exclusions=["Dining furniture", "Beverages", "Floral styling"]),
    Vendor(id="orchard-banquet", name="Orchard Banquet", tagline="Room for your whole celebration", description="A large-gathering buffet package with a broad guest capacity and halal menu options.", service_style="buffet", dietary_support=["halal", "vegetarian"], unpriced_dietary_extras=["vegetarian"], min_billable_guests=100, max_guests=500, per_guest="38.00", delivery_setup="300.00", service_percent="0", tax_percent="9", inclusions=["9-course buffet", "Buffet setup", "Welcome drink station"], exclusions=["Dining furniture", "Service staff", "Vegetarian main-course upgrades"]),
    Vendor(id="ember-table", name="Ember Table", tagline="A warm, intimate evening", description="A small plated supper with a slow, personal pace and on-site chefs.", service_style="plated", dietary_support=[], min_billable_guests=20, max_guests=60, per_guest="72.00", delivery_setup="220.00", service_percent="10", tax_percent="9", inclusions=["3-course plated supper", "Chef team", "Crockery"], exclusions=["Dietary menu adaptations", "Beverages", "Dining furniture"]),
]


class Estimate(Model):
    guests: int
    billable_guests: int
    food_subtotal: str
    delivery_setup: str
    service_charge: str
    tax: str
    total: str
    budget_difference: Optional[str]


class VendorResult(Model):
    vendor: Vendor
    estimate: Optional[Estimate]
    matches: bool
    reasons: List[str]
    concerns: List[str]


class VendorsResponse(Model):
    wedding: WeddingView
    revision: int
    criteria: VendorCriteria
    shortlisted_ids: List[str]
    needs_review: bool
    matched_count: int
    results: List[VendorResult]
    catalogue_note: str


def money(value):
    return format(Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP), ".2f")


def estimate(vendor, guests, budget=None):
    if guests is None:
        return None
    billable = max(guests, vendor.min_billable_guests)
    food = Decimal(vendor.per_guest) * billable
    extras = Decimal(vendor.delivery_setup)
    service = Decimal(money(food * Decimal(vendor.service_percent) / 100))
    tax = Decimal(money((food + extras + service) * Decimal(vendor.tax_percent) / 100))
    total = food + extras + service + tax
    return Estimate(guests=guests, billable_guests=billable, food_subtotal=money(food), delivery_setup=money(extras), service_charge=money(service), tax=money(tax), total=money(total), budget_difference=money(Decimal(budget) - total) if budget else None)


def compare(brief, criteria):
    guests = int(brief.guests) if brief.guests else None
    results = []
    location_supported = brief.location.strip().lower() in {"singapore", "sg"}
    for vendor in CATALOGUE:
        reasons, concerns = [], []
        quote = estimate(vendor, guests, criteria.catering_budget)
        if not location_supported:
            concerns.append("This sample catalogue serves Singapore; review your saved wedding location.")
        if guests is None:
            concerns.append("Add your guest count to estimate the package total.")
        elif guests > vendor.max_guests:
            concerns.append(f"Guest count exceeds the sample capacity of {vendor.max_guests}.")
        else:
            reasons.append(f"Sample capacity accommodates your {guests} guests.")
        for need in criteria.dietary_requirements:
            if need not in vendor.dietary_support:
                concerns.append(f"Sample package does not list {need} support.")
            else:
                reasons.append(f"Sample package lists {need} menu options; verify details with the supplier.")
            if need in vendor.unpriced_dietary_extras:
                concerns.append(f"Pricing for {need} menu adaptations is missing; the sample total excludes that upgrade.")
        if criteria.service_style != "any" and criteria.service_style != vendor.service_style:
            concerns.append(f"Offers {vendor.service_style} service, rather than your selected {criteria.service_style} style.")
        if quote:
            if quote.billable_guests > guests:
                # An order minimum is a cost consideration, not a capacity failure.
                reasons.append(f"Minimum order bills {quote.billable_guests} portions for {guests} guests.")
            if quote.budget_difference is not None:
                if Decimal(quote.budget_difference) < 0:
                    concerns.append(f"Sample total is S${money(-Decimal(quote.budget_difference))} over your catering budget.")
                elif not any(need in vendor.unpriced_dietary_extras for need in criteria.dietary_requirements):
                    reasons.append(f"Sample total is S${quote.budget_difference} within your catering budget.")
        results.append(VendorResult(vendor=vendor, estimate=quote, matches=not concerns, reasons=reasons, concerns=concerns))
    return sorted(results, key=lambda item: (not item.matches, Decimal(item.estimate.total) if item.estimate else Decimal(item.vendor.per_guest), item.vendor.id))


def load_selection(store, wedding_id):
    with store.connection() as db:
        row = db.execute("SELECT * FROM vendor_selections WHERE wedding_id=?", (wedding_id,)).fetchone()
    return dict(row) if row else {"revision": 0, "criteria": "{}", "shortlisted_ids": "[]", "reviewed_brief_revision": None}


def save_selection(store, wedding_id, change):
    known = {vendor.id for vendor in CATALOGUE}
    if change.shortlisted_ids is not None and any(item not in known for item in change.shortlisted_ids):
        raise HTTPException(422, "Choose vendors from the catalogue")
    with store.connection() as db:
        db.execute("BEGIN IMMEDIATE")
        brief_revision = db.execute("SELECT revision FROM weddings WHERE id=?", (wedding_id,)).fetchone()[0]
        if brief_revision != change.brief_revision:
            raise HTTPException(409, "Your wedding brief changed. Refresh the vendor matches first.")
        row = db.execute("SELECT * FROM vendor_selections WHERE wedding_id=?", (wedding_id,)).fetchone()
        state = dict(row) if row else {"revision": 0, "criteria": "{}", "shortlisted_ids": "[]", "reviewed_brief_revision": None}
        if state["revision"] != change.expected_revision:
            raise HTTPException(409, "Your shortlist changed. Refresh before saving again.")
        criteria = change.criteria.model_dump_json() if change.criteria is not None else state["criteria"]
        ids = json.dumps(change.shortlisted_ids) if change.shortlisted_ids is not None else state["shortlisted_ids"]
        reviewed = brief_revision if change.criteria is not None else state["reviewed_brief_revision"]
        db.execute("""INSERT INTO vendor_selections(wedding_id,revision,criteria,shortlisted_ids,reviewed_brief_revision)
                      VALUES(?,?,?,?,?) ON CONFLICT(wedding_id) DO UPDATE SET
                      revision=excluded.revision,criteria=excluded.criteria,shortlisted_ids=excluded.shortlisted_ids,
                      reviewed_brief_revision=excluded.reviewed_brief_revision""",
                   (wedding_id, state["revision"] + 1, criteria, ids, reviewed))


def discovery(store, row):
    state = load_selection(store, row["id"])
    criteria = VendorCriteria.model_validate_json(state["criteria"])
    brief = WeddingBrief.model_validate_json(row["brief"])
    results = compare(brief, criteria)
    return VendorsResponse(
        wedding=serialize_wedding(row), revision=state["revision"], criteria=criteria,
        shortlisted_ids=json.loads(state["shortlisted_ids"]),
        needs_review=state["reviewed_brief_revision"] != row["revision"],
        matched_count=sum(item.matches for item in results), results=results,
        catalogue_note="All six suppliers, packages and prices are fictional sample data. Estimates are not quotations. Availability, dietary certification, fees and inclusions require supplier confirmation.",
    )

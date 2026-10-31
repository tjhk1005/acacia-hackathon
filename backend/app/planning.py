"""Deterministic plan validation and calculations; no model arithmetic."""
from decimal import Decimal, ROUND_HALF_UP

from .models import WeddingBrief


def missing_fields(brief: WeddingBrief):
    missing = [key for key in ("names", "location", "guests", "budget")
               if not str(getattr(brief, key)).strip()]
    if not brief.flexibleDate and not brief.date:
        missing.append("date")
    return missing


def merge_brief(brief: WeddingBrief, patch):
    # null means unchanged; empty strings/lists explicitly clear values.
    changes = patch.model_dump(exclude_none=True)
    if "style" in changes and changes["style"] != brief.style and "direction" not in changes:
        changes["direction"] = ""
    if "decor" in changes:
        changes["decor"] = {**brief.decor.model_dump(), **changes["decor"]}
    updated = WeddingBrief.model_validate({**brief.model_dump(), **changes})
    changed = [key for key in changes if getattr(brief, key) != getattr(updated, key)]
    return updated, changed


def budget_summary(brief: WeddingBrief):
    total = Decimal(brief.budget) if brief.budget else None
    guests = int(brief.guests) if brief.guests else None
    per_guest = (total / guests).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if total and guests else None
    return {
        "currency": "SGD",
        "total": format(total, ".2f") if total else None,
        "per_guest": format(per_guest, ".2f") if per_guest is not None else None,
        "note": "Overall budget per guest, not a catering quote. No vendor costs recorded yet.",
    }


def serialize_wedding(row):
    brief = WeddingBrief.model_validate_json(row["brief"])
    return {
        "id": row["id"], "revision": row["revision"], "status": row["status"],
        "brief": brief.model_dump(), "missing_fields": missing_fields(brief),
        "budget_summary": budget_summary(brief),
        "created_at": row["created_at"], "updated_at": row["updated_at"],
    }

# Catering discovery and comparison

The Next.js `/vendors` page connects to the existing wedding brief and prototype per-wedding
session. It shows all saved quiz feelings, worlds and signature categories. A differing local quiz/details draft must be synced through `/planner` before changing the shortlist. This is the first discovery/comparison milestone, alongside the existing simulated
coordination dashboard at `/coordinator`. It does not send messages, book a supplier or call an AI.

## Data provenance

All six catering suppliers and all package prices are explicitly fictional examples, defined in
`app/vendors.py`. Every record carries `source=fictional_sample` and `availability=unconfirmed`.
No certification, price, availability or package inclusion is asserted about a real company.
Dietary menus, capacity, charges and tax rates are sample inputs for testing, not supplier evidence
or tax guidance. No supplier contact details are fabricated.

The website labels the catalogue, each supplier and the comparison as sample data. Selecting an
option adds it to a saved comparison shortlist; it creates no coordination record or external enquiry.
Real supplier records and evidence-backed quotations are a subsequent milestone.

## Matching and calculations

The current matching engine is deterministic. It does not score aesthetic fit from the personality; the profile is preserved as context for future evidence-backed matching. It checks the saved guest count, an explicitly
recognised Singapore location, selected required menu options, service style and optional catering
budget. It does not infer hard dietary restrictions from free-text notes: the page shows the original
notes and asks the couple to review the menu filters. Applying filters records that review against
the current brief revision. A later brief change requires review again.

The catering allocation is independent of the TOTAL wedding budget. No percentage is assumed.
Missing guest counts produce no estimate. Missing catering budgets produce no affordability claim.

For each package, using decimal arithmetic and round-half-up to cents:

1. Billable portions = max(actual guests, minimum order).
2. Food subtotal = billable portions × package rate.
3. Service charge = food subtotal × sample service percentage, rounded to cents.
4. Tax = (food + delivery/setup + service) × sample tax percentage, rounded to cents.
5. Total = food + delivery/setup + service + tax.

Capacity is checked against the actual guest count. Minimum order increases cost rather than
silently excluding a smaller party. Known required menu adaptations with unpriced fees are flagged
and excluded from matching; the displayed base estimate does not establish affordability.
Matching packages sort before others, then by estimated total. This is not an AI popularity ranking.

## API

Both endpoints require the existing `X-Wedding-Token` header:

- `GET /api/weddings/{id}/vendors`: current wedding, vendor-selection revision, saved criteria,
  shortlist, review state, matching results and itemised estimates.
- `PATCH /api/weddings/{id}/vendors`: update criteria and/or shortlist. Request:

```json
{
  "expected_revision": 0,
  "brief_revision": 2,
  "criteria": {
    "catering_budget": "6000",
    "dietary_requirements": ["halal", "vegetarian"],
    "service_style": "buffet"
  },
  "shortlisted_ids": ["saffron-gathering"]
}
```

Criteria and shortlisted IDs are optional independently. Shortlists contain at most three unique,
known catalogue IDs. Unknown vendors, invalid amounts and unsupported menu requirements return
422 without mutation. A stale brief or vendor-selection revision returns 409 without overwriting
newer choices. Updates are transactional and persist in SQLite's `vendor_selections` table.
They do not modify, reconfirm or allocate money from the wedding brief.

## Verification

Run the complete backend suite from `backend/` with `.venv/bin/python -m pytest -q`.
The vendor tests cover minimum orders, service/tax arithmetic, hard constraints, unpriced extras,
unknown guest counts, missing category budgets, privacy, persistence, stale edits and recalculation
after preference changes. The existing coordination tests remain part of the integration gate.

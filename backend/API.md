# Frontend handoff — planning API v0.2

Base URL: `http://127.0.0.1:8000`. JSON requests and responses. An example browser client is in
`examples/client.ts`; copy it into the frontend or use its existing `WeddingBrief` type.
Set the base URL in the frontend's configuration; never expose an AI API key there.

## Endpoints

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| GET | `/health` | — | `{status, ai_configured, ai_provider, version}` |
| POST | `/api/weddings` | `{}` or `{brief: WeddingBrief}` | `{wedding, access_token}` |
| GET | `/api/weddings/{id}` | — | `{wedding}` |
| PATCH | `/api/weddings/{id}` | `{expected_revision, brief: Partial<WeddingBrief>}` | `{wedding}` |
| POST | `/api/weddings/{id}/chat` | `{message, expected_revision, request_id}` | `{wedding, reply, changed_fields, questions, request_id, agent}` |
| GET | `/api/weddings/{id}/messages` | — | `{messages: [{role, content, created_at}]}` (latest 100) |
| POST | `/api/weddings/{id}/confirm` | `{expected_revision}` | `{wedding}` |
| GET | `/api/weddings/{id}/vendors` | — | Saved catering filters, shortlist, matching results and sample estimates. |
| PATCH | `/api/weddings/{id}/vendors` | `{expected_revision, brief_revision, criteria?, shortlisted_ids?}` | Updated vendor discovery state. |
| GET | `/api/weddings/{id}/controller` | — | Current assignments, next action, vendor desk and activity. |
| POST | `/api/weddings/{id}/controller/run` | `{expected_revision, brief_revision, input_version, request_id}` | Persisted plan and up to 20 newly prepared message drafts. |

Every wedding-specific request needs `X-Wedding-Token: <access_token>`. Tokens are returned only
on create. The create response's `wedding.revision` is 0. Changes to the brief or its
confirmation status increment it. Unchanged chat turns, identical edits and repeated
confirmation preserve the revision and `updated_at`; chat history and request replay are
still saved atomically. Stale expected revisions are rejected even for unchanged turns.
Vendor selections have their own revision (see below).

The controller also has its own revision. Use its returned input version and a UUID
for atomic retries and stale-input checks; see [CONTROLLER.md](CONTROLLER.md).
For chat, generate a UUID `request_id` and preserve the entire request body when retrying a timeout.
If a completed request is replayed later, it returns the original snapshot, which may have an older
revision; fetch the wedding again before allowing more edits.

Live messaging routes, separate connection revisions, signed public callbacks and
delivery-state semantics are documented in [WHATSAPP.md](WHATSAPP.md).
Persistent schedule notifications, proposal creation and explicit approval/rejection
routes are documented in [SCHEDULE.md](SCHEDULE.md).

## Wedding shape

```json
{
  "id": "server-generated UUID",
  "revision": 0,
  "status": "draft",
  "brief": {
    "names": "Alex & Sam",
    "date": "2027-06-12",
    "flexibleDate": false,
    "location": "Singapore",
    "guests": "80",
    "budget": "20000",
    "keywords": "soft florals, warm lighting",
    "style": "",
    "direction": "",
    "personality": {"version": 3, "complete": false, "words": "", "feelings": [], "worlds": [], "signatures": []},
    "decor": {"florals": "White roses", "lighting": "Candles", "tables": "Round tables"},
    "priorities": ["Beautiful food", "Photography"],
    "notes": "Halal food required. Step-free access."
  },
  "missing_fields": [],
  "budget_summary": {
    "currency": "SGD",
    "total": "20000.00",
    "per_guest": "250.00",
    "note": "Overall budget per guest, not a catering quote. No vendor costs recorded yet."
  },
  "created_at": "2026-10-31T03:00:00+00:00",
  "updated_at": "2026-10-31T03:00:00+00:00"
}
```

Money is SGD in this milestone; numeric strings prevent frontend/backend decimal mismatch.
`budget` is always the TOTAL wedding budget, never a category allocation. The preferences agent
must clarify budget scope rather than treating a catering budget as the overall wedding budget.
The per-guest number divides the total wedding budget; it is not an estimated vendor price.

`style` is empty or one of `garden`, `beach`, `classic`, `modern`, `rustic`, `bohemian`, `tropical`,
`intimate`. Legacy `coastal` input normalizes to `beach`. `direction` is empty or `<style>-0` through
`<style>-7`, matching only the legacy catalogue. The new quiz uses `personality` instead. Changing style clears direction unless a compatible
direction is supplied. Nested `decor` patches merge individual florals/lighting/tables values;
unrelated choices are preserved. Empty strings clear individual values.
Unknown text/numbers/dates are `""`; `priorities` can be `[]`. In patches, omitted/null fields mean
unchanged; `""`/`[]` clear fields. Guests must be 1–10000; budgets must be positive, finite and
have at most two decimal places. A date, when provided, must be a real YYYY-MM-DD date.
Required before confirmation: names, location, guests, budget, and date if flexibleDate=false.

## Version-3 personality

`brief.personality` holds `{version: 3, complete, words, feelings, worlds, signatures}`. Each group contains kept idea objects with `id`, `kind`, `title`, `description`, `query`, `tags`, `colors` and `referenceId`. Signatures include `direction`, `palette`, `setting`, `nature` and `simplicity` choices. Multiple worlds, palettes and alternatives must remain intact. See the shared [contract fixture](../tests/fixtures/personality-v3.json).

Omitting `personality` on creation preserves legacy compatibility with an empty profile. An explicit PATCH replaces the complete personality with the provided profile; omitted/null means unchanged. Completed profiles need words or feelings, at least one world, and at least one signature. The backend validates group kinds and unique IDs. `style` and catalogue direction IDs must not be used to compress the new profile.

The AI reads the saved personality as context, but its output schema excludes `personality`; chat patches cannot replace the couple's kept choices. Chat can record explicitly changed requirements in keywords/notes and invite quiz refinement. Quiz updates use the normal expected-revision check and return a confirmed brief to draft.

## Chat

```json
{
  "message": "We now expect 100 guests. Keep halal food as a requirement.",
  "expected_revision": 0,
  "request_id": "0837ae22-4d64-4ced-a104-7e60ce6af4d0"
}
```

The response contains an assistant reply, up to three questions, the changed field names and the
complete saved wedding. Replace local state with `wedding.brief`; do not parse facts out of the
assistant's prose. The current milestone calls only the preferences agent. Explicit user statements
are saved as a draft; the couple can edit them and use the confirm endpoint. A factual change resets
confirmation. The website should label the AI chat as requiring the configured AI connection.

## Error handling

| Status | Meaning | Website action |
| --- | --- | --- |
| 404 | Missing wedding or wrong token | Ask user to reopen the correct wedding/session. |
| 409 | Stale revision or reused request ID with different body | Reload latest wedding; preserve the user's pending input. |
| 422 | Validation error / incomplete brief | Show details next to the relevant fields. |
| 503 | `ai_not_configured` | Keep manual brief editing enabled; explain AI isn't connected yet. |
| 502 / 504 | Invalid/unavailable AI response or timeout | Keep input and offer retry with the same request body/ID. |

Errors use FastAPI's `{detail: ...}` envelope. No chat messages or preference changes are saved on
failed AI calls. A revision conflict after inference also saves no chat turn.

This service has prototype wedding-token access, not account login/invite flows. Keep tokens secret.
The two collaborators' views should refresh after writes; live push updates are not implemented.

## Connected planner page

The website's `/planner` page uses a same-origin `/planning-api` proxy. It stores the wedding ID
and prototype token in tab session storage. It reads the v3 personality draft first, with a legacy-brief fallback, and mirrors accepted server replies into both browser records while preserving quiz discovery progress.
It asks before importing that local snapshot and before replacing a differing server brief on return.
Chat is disabled when `/health` reports `ai_configured=false`; manual editing remains available.

`ai_provider` identifies the selected adapter (`anthropic` or `openai`). Provider choice and API keys
are configured only on the backend. `ai_configured=true` means a credential is present, not that an
external authentication or billing check has passed. Both providers return the same chat response.

Vendor discovery details and calculation rules: [VENDORS.md](VENDORS.md). Its `expected_revision`
refers to the separate vendor-selection revision; `brief_revision` refers to the wedding revision.
All initial catering records are fictional sample data, with date availability unconfirmed.

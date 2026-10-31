# Frontend handoff — planning API v0.1

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

Every wedding-specific request needs `X-Wedding-Token: <access_token>`. Tokens are returned only
on create. The create response's `wedding.revision` is 0. Successful writes increment it.
For chat, generate a UUID `request_id` and preserve the entire request body when retrying a timeout.
If a completed request is replayed later, it returns the original snapshot, which may have an older
revision; fetch the wedding again before allowing more edits.

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
    "style": "garden",
    "direction": "garden-0",
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
`<style>-7`, matching the website catalogue. Changing style clears direction unless a compatible
direction is supplied. Nested `decor` patches merge individual florals/lighting/tables values;
unrelated choices are preserved. Empty strings clear individual values.
Unknown text/numbers/dates are `""`; `priorities` can be `[]`. In patches, omitted/null fields mean
unchanged; `""`/`[]` clear fields. Guests must be 1–10000; budgets must be positive, finite and
have at most two decimal places. A date, when provided, must be a real YYYY-MM-DD date.
Required before confirmation: names, location, guests, budget, and date if flexibleDate=false.

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
and prototype token in tab session storage, and a local brief snapshot alongside visual onboarding.
It asks before importing that local snapshot and before replacing a differing server brief on return.
Chat is disabled when `/health` reports `ai_configured=false`; manual editing remains available.

`ai_provider` identifies the selected adapter (`anthropic` or `openai`). Provider choice and API keys
are configured only on the backend. `ai_configured=true` means a credential is present, not that an
external authentication or billing check has passed. Both providers return the same chat response.

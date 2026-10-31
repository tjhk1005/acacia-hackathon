# Ever After planning backend

First milestone: website → preferences specialist → persistent, editable wedding brief.

This is an independent Python/FastAPI service. It does not modify the Next.js website on
`origin/codex/wedding-planner-plan`. Its `brief` format matches that branch's `lib/wedding.ts`,
including string-valued `guests` and `budget`, camelCase `flexibleDate`, and the three style IDs.

## Run

From this repository's root (Python 3.9+; Python 3.11+ recommended for new setups):

```sh
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt
cp backend/.env.example backend/.env
cd backend
.venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/docs` for the interactive API, or `/openapi.json` for its schema.
For the exact dependency versions tested here, install `backend/requirements-dev.lock` instead.
The frontend stays on port 3000. Configure `CORS_ORIGINS` for its exact origin.
Brief editing, persistence, validation, confirmation and budget summaries work without an AI key.
To enable chat, set `OPENAI_API_KEY` and `OPENAI_MODEL` in `backend/.env`, then restart the service.
Use a model available to your API account that supports Responses structured outputs.
The configurable starting model is `gpt-4o-mini`; no key or paid API calls are bundled.

## Website integration

See [API.md](API.md) and [examples/client.ts](examples/client.ts).
The website can keep its current onboarding and upload its existing brief on create.
Use the returned wedding ID, token and revision for subsequent edits and chat.
Local-storage-only briefs do not automatically appear in the backend; create them explicitly once.
An empty create uses unknown values for guest count, budget and location, rather than treating
the website's suggested values as confirmed preferences. `garden` remains a display default.

## Structure and ownership

- `app/models.py`: shared API validation and structured AI output.
- `app/agents.py`: preferences specialist; one bounded AI request per chat turn.
- `app/main.py`: controller/endpoints; applies validated patches and coordinates persistence.
- `app/planning.py`: deterministic validation and SGD budget-per-guest calculation.
- `app/store.py`: SQLite persistence, brief revisions, chat history and replay of completed requests.
- `tests/`: integration tests using a simulated specialist; no external messages or AI spend.

Teammate 3 should add communication/vendor modules behind separate endpoints. Reading a brief,
recording a quotation, composing a message and sending one are separate operations. This milestone
has no vendor sending/booking tools, no catalogue, and no quotation-comparison endpoint yet.

The AI extracts direct preferences; it never confirms the brief. User confirmation is an explicit
endpoint. Any subsequent meaningful edit makes the brief a draft again. Concurrent changes return
409 instead of overwriting a newer brief. Reusing a completed chat's request ID and identical body
returns its original response; failed requests can be retried. Concurrent identical requests may
both reach the AI provider before either saves, but only one turn is persisted.

## Verification

```sh
cd backend
.venv/bin/python -m pytest
```

Tests cover frontend-compatible briefs, invalid data, cross-wedding access, persistence after restart,
confirmation, corrections, partial patches, chat history, retry replay, concurrent edits, AI failures,
unconfigured AI, CORS, and exact decimal budget calculations. Live model quality still needs testing
with the team's API key; simulated responses do not establish extraction quality.

## Hosting and data

Run this service separately from the frontend with a persistent disk for SQLite. The database path
is relative to `backend/` unless absolute. A Vercel frontend can call a hosted backend over HTTPS;
do not put SQLite on Vercel's temporary filesystem. One backend instance is the initial target.
For multiple instances, migrate persistence to a shared database.

The access token is a prototype bearer credential scoped to one wedding. Its hash is stored in the
database. Anyone with that token can edit that wedding, so share it only with intended collaborators.
Keep it out of URLs, logs and source control. Full user accounts, invitations, recovery, abuse/rate
limits and production deployment are future work. Keep the development service on loopback.

Wedding data and chat are stored locally in SQLite. Using AI chat sends the saved brief and up to
12 recent messages to the configured AI provider with response storage disabled (`store=False`).
That flag is not a promise about provider retention. Keys, wedding data and virtual environments
are excluded from Git. The project has not yet selected an open-source license.

AI integration reference: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

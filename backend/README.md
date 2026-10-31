# Ever After planning backend

Integrated milestone: version-3 personality quiz → preferences chat → persistent wedding → sample catering comparison.

This Python/FastAPI service is connected to the Next.js website through `/planning-api/*`.
Its `brief` format matches `lib/wedding.ts`, including string-valued `guests` and `budget`,
camelCase `flexibleDate`, practical `decor` fields and the complete version-3 `personality`. Feelings, worlds and every signature category retain multiple kept ideas. Legacy single `style`/`direction` fields remain compatible; `coastal` migrates to `beach`. Existing database records load with an empty personality until the couple explicitly imports their quiz.

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
To enable Claude chat, set `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`
in `backend/.env`, then restart the service. The starting model is `claude-haiku-5-5`.
For OpenAI instead, set `AI_PROVIDER=openai`, `OPENAI_API_KEY` and `OPENAI_MODEL` (default:
`gpt-4o-mini`). Only the selected provider's credential is used. A key from one provider cannot
authenticate with the other. Keys and paid API credits are not bundled with the project.

## Website integration

See [API.md](API.md) and [examples/client.ts](examples/client.ts).
The website starts with the three-chapter personality quiz. `/planner` imports its full v3 profile and separate practical details on create, and asks which version to retain if the local draft differs from the saved server wedding. Planner replies update the v3 browser record and compatible legacy mirror.
Use the returned wedding ID, token and revision for subsequent edits and chat.
Local-storage-only briefs do not automatically appear in the backend; create them explicitly once.
An empty create uses unknown values for guest count, budget and location, rather than treating
any example values as confirmed preferences. An empty setting means still exploring.
The planner page lets couples explicitly import a local brief and resolve differences when returning
from the visual screens. Its per-wedding bearer token is held in tab session storage.

## Structure and ownership

- `app/models.py`: shared API validation, version-3 personality and a narrower structured AI patch that cannot replace quiz selections.
- `app/agents.py`: Claude/OpenAI adapters for the same preferences specialist; one bounded AI request per chat turn.
- `app/main.py`: controller/endpoints; applies validated patches and coordinates persistence.
- `app/planning.py`: deterministic validation and SGD budget-per-guest calculation.
- `app/store.py`: SQLite persistence, brief revisions, chat history and replay of completed requests.
- `app/controller.py`: next-step decisions, role assignments, dependencies, bounded shared tools and activity persistence. See [CONTROLLER.md](CONTROLLER.md).
- `app/vendors.py`: fictional catering catalogue, deterministic package estimates and saved shortlists.
- `tests/`: integration tests using a simulated specialist; no external messages or AI spend.

Vendor discovery is available at `/vendors` on the website, backed by private GET/PATCH endpoints.
See [VENDORS.md](VENDORS.md) for sample-data provenance, calculation rules and API examples.
The separate [coordinator](COORDINATOR.md) supports drafts and simulated vendor messages.
Reading a brief, recording a quotation, composing a message and sending one are separate operations.
Real quotation import, external message delivery and booking are not implemented yet.

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

Tests cover both SDK adapters and provider selection, frontend-compatible briefs, invalid data, cross-wedding access, persistence after restart,
confirmation, corrections, partial patches, chat history, retry replay, concurrent edits, AI failures,
unconfigured AI, CORS, and exact decimal budget calculations. The full personality round-trip is tested across chat, editing, comparison, coordinator refinement and restart. Live model quality still needs testing
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
12 recent messages to the selected AI provider. OpenAI requests disable response storage
(`store=False`); Claude requests use the Messages API. Provider-specific retention terms still apply.
Keys, wedding data and virtual environments
are excluded from Git. The project has not yet selected an open-source license.

AI integration reference: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
Claude integration reference: [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).

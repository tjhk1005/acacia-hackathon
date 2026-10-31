# Vendor coordination prototype

## Current reminder and checklist policy

Availability enquiries require explicit review of the exact message before approval. Standard task reminders are scheduled automatically when a task is created, defaulting to **24 hours before the deadline**. No individual reminder approval is required. Optional `reminder_hours` changes the lead time; `automatic_reminders: false` explicitly retains per-message review when needed. Existing tasks retain saved reminder times; legacy tasks without one receive the one-day default.

The checklist uses persisted task completion. `PATCH /tasks/{task_id}` with `{ "done": true }` cancels pending reminders and updates the derived total/completed/remaining summary returned by the overview. `{ "done": false }` reopens the task with a fresh reminder generation; repeated identical updates are idempotent. Previously delivered messages remain history.

Automatic scheduling does not imply a live WhatsApp transport. Simulation records simulated delivery; manual WhatsApp groups become `ready_to_share` automatically when due, and a user must still send the message in WhatsApp. Automatic reminders use standard task templates, not unreviewed AI rewrites.


The coordinator shares the integrated backend's wedding record, including the complete version-3 personality. The Next.js quiz, `/planner` and `/vendors` use that same brief when explicitly synced. This separate developer dashboard still requires reconnecting with the wedding ID and private token; catering shortlists do not automatically become coordinator vendors or enquiries.

## Run

From the repository root:

```sh
python -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements-dev.lock
backend/.venv/bin/uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000
```

Open `/coordinator` on the Next.js website for the integrated dashboard. It reuses the planner session from the same browser tab; open `/planner` first if needed. The homepage, planner and vendor screens link to it. The backend also retains its legacy standalone `/coordinator` page. Interactive API documentation is at `/docs`.

Create a wedding with a date and location. Save its ID and access token privately; the tab stores them in session storage. Add vendors, record deliverables with deadlines, and choose a reminder lead time (1 day, 2 days, 3 days or 1 week in the dashboard; 1–168 hours via API). A reminder draft is created immediately, including its planned delivery time. Standard reminders are scheduled automatically. For availability enquiries, open **Review message**, read the exact recipient and wording, check the acknowledgement, then approve. Availability enquiries can be generated with **Check availability & reminders**. Record simulated replies with an explicit availability annotation. Availability does not mean a booking. Mark completed tasks to cancel their pending reminders.

The coordinator supports dress, catering, emcee (主持人), flowers, venue and accommodation. Original replies are retained as evidence. Unknown availability produces an enquiry; each task produces one scheduled reminder per brief revision, defaulting to 24 hours before its deadline. Existing tasks receive that default lead time. Repeated runs and approvals do not duplicate messages. Any brief revision invalidates pending drafts and availability annotations conservatively. Regenerate drafts after changes. Dates require timezone offsets; the dashboard converts local input to UTC.

SQLite persists vendors, tasks, messages and delivery statuses alongside weddings. Every coordination endpoint requires the wedding's `X-Wedding-Token`. Tokens are bearer credentials; this is a local prototype, not a deployed multi-user authentication system. Use TLS and proper session management before deployment.

## Optional AI

Without a provider key, coordination uses deterministic templates and requires no paid APIs. Configure the backend provider (`AI_PROVIDER=openai` with `OPENAI_API_KEY` / `OPENAI_MODEL`, or `AI_PROVIDER=anthropic` with `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`) server-side to enable **Refine with AI**. This sends the current wedding brief (including quiz personality), selected vendor record and draft to the provider, then saves proposed wording for review. AI cannot dispatch messages, mark availability, book services or change tasks. Failed AI calls leave drafts unchanged. Model-generated wording must be reviewed before approval. Automated tests use a fake provider; live paid inference has not been validated.

## Transport and scheduling boundaries

This prototype never sends WhatsApp or Telegram messages. Channel and group references are metadata. Approval records `simulated`, never `sent`. Replies are entered manually and labelled simulated. A production transport needs official provider credentials, verified webhook handling, participant consent, group-access feasibility checks, delivery receipts and durable idempotent retries. Do not substitute browser automation for official platform access.

The backend lifespan runs a reminder worker every 15 seconds. Automatic and explicitly approved reminders are stored with `scheduled` status, the approval token and timestamp, and their due time. Availability enquiry drafts never dispatch without review; task templates are authorized by the automatic reminder policy. The worker checks the current brief revision and approval token inside a SQLite write transaction before recording a simulated delivery. Multiple workers serialize through SQLite to prevent duplicate processing. Completing tasks, changing the brief or cancelling a scheduled reminder prevents pending dispatch. Availability replies cancel obsolete enquiry drafts.

Persisted schedules survive restarts. Overdue approved reminders are processed on the next tick after startup. The backend must be running with persistent SQLite storage; no process means no delivery until it restarts. SQLite scheduling is appropriate for this prototype, not serverless hosts with ephemeral filesystems. Delivery remains simulated: there is no external transport yet.

Approval requires the `review_token` returned with the exact displayed message. The token binds message ID, vendor, content, schedule and brief revision. Changed wording or schedules return 409 and require another review. Refinement never grants approval.

## API

All paths below are relative to `/api/weddings/{id}/coordination`:

- `GET /`: current vendor, task and message state.
- `POST /vendors`: `name`, `category`, `channel`, `contact`.
- `POST /tasks`: `vendor_id`, `title`, timezone-aware `due_at`, optional `reminder_hours` (1–168, default 24).
- `POST /tasks/{task_id}/complete`: complete task and cancel pending reminder.
- `POST /vendors/{vendor_id}/replies`: original `content`, explicitly annotated `availability` (`unknown`, `available`, `unavailable`).
- `POST /run`: optional `reminder_hours` (1–168, default 24).
- `POST /messages/{message_id}/refine`: optional AI rewrite; retains draft status.
- `POST /messages/{message_id}/approve`: body `{ "review_token": "<token from reviewed message>" }`; rejects stale/cancelled drafts, queues reminders or simulates immediate enquiries.
- `POST /messages/{message_id}/cancel`: cancel an undelivered draft or schedule.

Run validation with `backend/.venv/bin/pytest -q backend/tests`.

## WhatsApp group sharing

The dashboard now supports named WhatsApp groups for manual sharing. See [WHATSAPP.md](WHATSAPP.md) for the actual capabilities and account prerequisites. Approved reminders become `ready_to_share` when due; users copy them into WhatsApp and explicitly record their own manual send. No live WhatsApp API connection, webhook or account authentication is implemented.

Task completion API: `PATCH /api/weddings/{id}/coordination/tasks/{task_id}` with `{ "done": true }` or `{ "done": false }`, authenticated with `X-Wedding-Token`.

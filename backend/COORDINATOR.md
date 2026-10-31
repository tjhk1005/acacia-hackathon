# Vendor coordination prototype

The coordinator shares the integrated backend's wedding record, including the complete version-3 personality. The Next.js quiz, `/planner`, `/vendors` and `/controller` use that same brief when explicitly synced. The website controller provides a vendor desk with the existing session. This separate developer dashboard still requires reconnecting with the wedding ID and private token; catering shortlists do not automatically become coordinator vendors or enquiries.

## Run

From the repository root:

```sh
python -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements-dev.lock
backend/.venv/bin/uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000
```

Open `/coordinator` on the running backend. Interactive API documentation is at `/docs`.

Create a wedding with a date and location. Save its ID and access token privately; the tab stores them in session storage. Add vendors, record deliverables with deadlines, then click **Run coordinator**. Review each draft and approve its simulated delivery. Record simulated replies with an explicit availability annotation. Availability does not mean a booking. Mark completed tasks to cancel their pending reminders.

The coordinator supports dress, catering, emcee (主持人), flowers, venue and accommodation. Original replies are retained as evidence. Unknown availability produces an enquiry; incomplete tasks due within 72 hours (including overdue work) produce one reminder per task per brief revision. Repeated runs and approvals do not duplicate messages. Any brief revision invalidates pending drafts and availability annotations conservatively. Regenerate drafts after changes. Dates require timezone offsets; the dashboard converts local input to UTC.

SQLite persists vendors, tasks, messages and delivery statuses alongside weddings. Every coordination endpoint requires the wedding's `X-Wedding-Token`. Tokens are bearer credentials; this is a local prototype, not a deployed multi-user authentication system. Use TLS and proper session management before deployment.

## Optional AI

Without a provider key, coordination uses deterministic templates and requires no paid APIs. Configure the backend provider (`AI_PROVIDER=openai` with `OPENAI_API_KEY` / `OPENAI_MODEL`, or `AI_PROVIDER=anthropic` with `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`) server-side to enable **Refine with AI**. This sends the current wedding brief (including quiz personality), selected vendor record and draft to the provider, then saves proposed wording for review. AI cannot dispatch messages, mark availability, book services or change tasks. Failed AI calls leave drafts unchanged. Model-generated wording must be reviewed before approval. Automated tests use a fake provider; live paid inference has not been validated.

## Transport and scheduling boundaries

This prototype never sends WhatsApp or Telegram messages. Channel and group references are metadata. Approval records `simulated`, never `sent`. Replies are entered manually and labelled simulated. A production transport needs official provider credentials, verified webhook handling, participant consent, group-access feasibility checks, delivery receipts and durable idempotent retries. Do not substitute browser automation for official platform access.

Reminder evaluation is currently triggered by **Run coordinator** (or authenticated `POST /api/weddings/{id}/coordination/run`), not a background scheduler. No reminders are sent while the service is stopped or without an explicit run. A production worker and persistent job queue remain future work. Booking, payment, cancellation, negotiation and autonomous external dispatch are intentionally unavailable.

## API

All paths below are relative to `/api/weddings/{id}/coordination`:

- `GET /`: current vendor, task and message state.
- `POST /vendors`: `name`, `category`, `channel`, `contact`.
- `POST /vendors/{vendor_id}/participation`: `{active: false}` excludes a vendor and cancels pending drafts; `{active: true}` reconsiders them with availability unknown. History is retained.
- `POST /tasks`: `vendor_id`, `title`, timezone-aware `due_at`.
- `POST /tasks/{task_id}/complete`: complete task and cancel pending reminder.
- `POST /vendors/{vendor_id}/replies`: original `content`, explicitly annotated `availability` (`unknown`, `available`, `unavailable`).
- Include `brief_revision` when recording availability to reject annotations against a stale date. The controller website includes it; the older standalone demo remains compatible without it.
- `POST /run`: optional `reminder_hours` (1–168, default 72).
- `POST /messages/{message_id}/refine`: optional AI rewrite; retains draft status.
- `POST /messages/{message_id}/approve`: idempotent simulated delivery, rejects stale/cancelled drafts.

Run validation with `backend/.venv/bin/pytest -q backend/tests`.

Both coordinator and controller draft preparation use the same keys and a limit of
20 new drafts per run. Re-run to prepare any remaining drafts. Excluded vendors are
ignored; unavailable vendors receive no new deadline reminders. Completed tasks
cancel their pending reminders. Only actual planning-state changes invalidate
availability and drafts; conversation-only turns preserve them.

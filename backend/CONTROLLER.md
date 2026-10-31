# Planning controller

The first Agent 4 implementation is a bounded rules-based controller, available at
`/controller` on the website. It reads the same saved wedding as `/planner` and
`/vendors`. No additional AI account or model call is required for a controller run.

## What a check does

1. Read a consistent snapshot of the brief, its confirmation status, reviewed
   catering criteria, sample shortlist, manually entered contacts, simulated and authenticated WhatsApp replies
   and vendor deliverables.
2. Assign structured tasks to the couple-understanding, vendor-communication,
   vendor-comparison and overall-coordination roles. Each task carries a stable key,
   dependencies, status, source brief revision, relevant evidence IDs and an action link.
3. Identify missing details, missing dates, infeasible sample selections, unreviewed
   drafts, unavailable contacts and overdue or approaching deadlines. Hard constraints
   remain intact; changing a date, budget or supplier requires a user decision.
4. For a complete, confirmed brief, prepare at most **20** missing enquiry/reminder
   drafts using the coordinator's shared tool. An enquiry needs a specific date.
   Reminders consider incomplete active-vendor tasks due within 72 hours, including
   overdue tasks. Unavailable or excluded vendors receive no new reminders.
5. Persist the task snapshot and activity events. Repeated unchanged checks update
   the check time without duplicating messages, activity or the controller revision.

GET computes a current preview without writing records. The page marks when a new
check is needed. Time crossing a reminder or overdue threshold also changes the
input version. The controller runs on an explicit click, not a background timer.

## Existing tools and boundaries

The controller invokes deterministic catering comparison and draft preparation.
The website links clarification and confirmation tasks to the existing planner;
it does not simulate an AI conversation or change the couple's preferences itself.
The four roles are logical owners of work, not four independent running AI loops.

The vendor desk uses the existing coordination endpoints. Explicitly annotated
replies retain their original text as simulated evidence. Excluding a vendor is
reversible, preserves history, removes their deadlines from active planning and
cancels their pending drafts. Reconsidering resets availability and allows a fresh
enquiry. The website includes the viewed brief revision when recording availability;
a changed brief rejects that annotation instead of attaching it to the wrong date.

Fictional catering records are never converted into real contacts automatically.
Real quotation extraction remains a visibly blocked task; a sample price or
availability annotation cannot mark it complete. The [WhatsApp integration](WHATSAPP.md) is a piloting preview in this release.
Its worker and live-send controls are disabled by default. External vendor search
is planned; live vendor conversations have not been tested.
Bookings, payments, cancellations and changed terms need explicit user decisions.
The simulated desk approval records **simulated delivery**; live drafts have a
separate **Send real WhatsApp message** action and provider delivery records.
`mode=mixed` means real WhatsApp evidence exists alongside simulated records.

## API

Every request requires `X-Wedding-Token`, as with the existing wedding endpoints.

- `GET /api/weddings/{id}/controller`: current task preview, next action, counts,
  coordination records, activity, `revision`, `input_version`, `needs_run` and
  `last_run_at`.
- `POST /api/weddings/{id}/controller/run`:

  ```json
  {
    "expected_revision": 0,
    "brief_revision": 1,
    "input_version": "<64-character hash returned by GET>",
    "request_id": "<new UUID>"
  }
  ```

`expected_revision` belongs to the controller, independently of the wedding and
vendor-selection revisions. The input hash also checks vendor replies, contacts,
selection changes and deadline phases. A stale input returns 409 without writing
drafts or events. Run execution and its replay result commit in one SQLite transaction.
Retry the identical body and UUID after an uncertain failure; it returns the original
result. Reusing that UUID for different input is rejected. A replay can describe an
older plan, so fetch the current view afterwards (the website does this).

Snapshots live in `controller_state`; activities live in `controller_events`, with
the most recent 30 returned. Existing per-wedding request storage provides replay.
There is no new source of truth for the brief, vendor catalogue or messages.

## Schedule decisions and returning users

The site-wide Updates inbox preserves unread schedule events and pending approvals
while the couple is away. The deadline section can propose a reschedule without
applying it; only an explicit, current approval updates the task and cancels unsent
old reminders. See [SCHEDULE.md](SCHEDULE.md) for the flow, routes and session scope.

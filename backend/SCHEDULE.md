# Schedule updates and approval

The **Updates** button is available across the website for the current saved
wedding session. Its inbox opens on return when unread updates or pending
approvals exist. It refreshes every ten seconds while visible and immediately on
focus, reconnect, tab visibility changes or an in-app schedule action.

Updates persist in SQLite while the couple is away. They cover added/completed
vendor deliverables, approved deadline changes, approaching deadlines (72 hours),
overdue tasks and vendor conversations that require a user decision. Deadline
alerts are caught up on the next inbox request, so they do not depend on an open
browser or a continuously running timer. Repeated refreshes do not duplicate them.

## Review flow

1. In `/controller`, under **Small tasks, clear dates**, open **Propose a schedule
   change for approval**, select an incomplete deliverable and enter the proposed
   title, time and reason.
2. The proposal is saved and a notification appears. The current deadline remains
   in effect. Creating or reading a proposal cannot apply it.
3. The inbox shows the current time when proposed, proposed time and reason.
   **Approve schedule change** applies that exact proposal. **Reject** preserves
   the current schedule. Marking notifications as read leaves approvals pending.
4. Approval checks the current brief, task revision, complete task snapshot and
   vendor's active status atomically. A changed/completed task, excluded vendor or
   changed brief invalidates the proposal. Two competing approvals cannot overwrite
   each other. Repeated clicks do not apply the same change twice.
5. Approval cancels unsent reminders for the old deadline. New reminders use the
   new task revision and deadline. A message already dispatched cannot be recalled.

Directly adding a deliverable or marking it complete is already an explicit user
action and creates an informational update. Proposed reschedules require a
separate decision. Approval updates the planner only: it does not message a vendor,
agree to terms, book a service or authorise payment. Vendor reply analysis flags a
decision request; it does not automatically infer or apply a new deadline.

## API

Every route requires `X-Wedding-Token`. Prefix: `/api/weddings/{id}/schedule`.

| Method | Path | Payload / result |
| --- | --- | --- |
| GET | `/schedule` | `{notifications, unread_count, pending_count}`. Materialises missed deadline alerts and invalidates stale proposals. Does not mark updates read. |
| POST | `/schedule/read` | `{ids: string[]}`; marks only the displayed IDs read. No approval effect. |
| POST | `/schedule/changes` | `{task_id, expected_task_revision, brief_revision, title, due_at, reason, request_id}`. UUID request ID provides idempotent creation; dates need an explicit UTC offset. |
| POST | `/schedule/changes/{change_id}/approve` | `{brief_revision, expected_task_revision}`; exact, atomic approval. |
| POST | `/schedule/changes/{change_id}/reject` | Same decision payload; no schedule mutation. |

`schedule_changes` stores immutable before/after snapshots and decisions.
`schedule_notifications` stores deduplicated updates and explicit read timestamps.
Notifications and actual schedule writes share the same database transaction.
The inbox prioritises pending approvals, then unread updates, and displays up to
100 records at once. Marking displayed records read exposes older unread updates.
There can be at most 100 pending proposals for a wedding.

This is an **in-app** inbox. It does not request browser push permissions or send
email/WhatsApp notifications. The prototype has wedding-token sessions rather
than separate user logins: read state is shared by holders of the same wedding
token, and reopening a wedding requires access to that saved session/token.
Persistent notifications are available whenever that wedding is reopened; cross-
device login, individual collaborator read receipts and account recovery remain
separate work.

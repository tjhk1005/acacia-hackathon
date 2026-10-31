# WhatsApp group handoff

## Available now

The website's `/coordinator` page has a WhatsApp group desk. It reuses your wedding's access token and saved vendors. Choose a WhatsApp vendor, enter a group name and confirm that participants have been informed before their messages are shared with the coordinator.

This saves a **manual sharing destination**, not a connection to WhatsApp. It does not authenticate a WhatsApp account, join or discover a group, import history, send through Meta, or register a webhook. There is no QR login or unofficial WhatsApp Web automation.

Messages follow this flow:

1. Coordinator generates a draft associated with the named group.
2. Availability enquiries require user review and approval. Standard task reminders are scheduled automatically, by default one day before the deadline.
3. Approved enquiries become `ready_to_share`; automatic task reminders become ready when due.
4. User copies the approved text, opens WhatsApp, chooses the named group and sends it.
5. Only after explicitly confirming that they sent it does the app record `manually_sent`.

Opening WhatsApp or copying text does not mark it sent. The app cannot verify a user's manual-send claim; it is recorded as their report, not a provider delivery receipt. Pasted replies are labelled `recorded_reply`, not received webhooks. A group change revokes pending approvals. The approval token binds the message, transport and group name, so old reviews cannot authorize a different group.

## Automatic AI group messaging: prerequisites still outstanding

The current user has not set up WhatsApp Business. No WhatsApp credentials are configured in this environment. Automatic group API access has not been verified, and Meta documentation access was blocked by the current network policy. No live messaging test has been performed.

To proceed with a supported automatic integration:

- Set up a Meta WhatsApp Business Platform account and verify its current Groups API access and supported group types with Meta. Do not assume an existing personal group can be joined by an API bot.
- Obtain the approved business phone number ID and access token. Supply secrets only through secure server/environment settings, never chat, browser code or Git.
- Host the backend at a stable public HTTPS endpoint, configure the webhook verification token and app secret, and subscribe to supported message/delivery events.
- Permit the required official API destinations in deployment networking (`graph.facebook.com`; `developers.facebook.com` for documentation).
- Implement and validate the transport against the account's documented API: signed webhook verification, message/event deduplication, delivery receipts, provider failures, consent and applicable message-window/template rules. Do not automatically retry uncertain deliveries.

These prerequisites do not exist yet. The manual desk keeps the planning workflow usable while account setup is pending. No script, fake connected state or credential placeholder enables automatic sending.

## API

Authenticated paths are relative to `/api/weddings/{id}/coordination` and require `X-Wedding-Token`:

- `POST /vendors/{vendor_id}/whatsapp-group`: `{ "group_name": "Wedding flowers", "participants_informed": true }`. WhatsApp vendors only. Changes pending messages to require fresh review.
- `POST /messages/{message_id}/approve`: exact `review_token`, as for other coordinator messages.
- `POST /messages/{message_id}/record-handoff`: `{ "review_token": "…", "sent_by_user": true }`. Only a `ready_to_share` message (approved enquiry or automatic reminder) can be recorded as manually sent. Idempotent retries retain that status.

The scheduler never converts a manual WhatsApp message to `simulated` or provider-confirmed `sent`: it becomes `ready_to_share`.

# WhatsApp integration — piloting

**Release status: PILOTING / PREVIEW ONLY.** The controller shows the intended
vendor search, enquiry, follow-up and approval workflow, plus an illustrative
unsent message. It does not search external directories or send messages. Automated
vendor discovery is planned; no live vendor conversation has been tested.

`WHATSAPP_PILOTING=true` is the default, independently of saved credentials or
`WHATSAPP_ENABLED`. The backend does not start a messaging worker or activate a
transport in pilot mode, rejects live connection/send requests and callbacks,
and prevents direct dispatch and reply analysis. The demo does not mount the
live connection controls; they are retained in `whatsapp-connection-desk.tsx`
for future development. All transport tests use fake providers or HTTP mocks.

The adapter code targets an individually opted-in WhatsApp conversation using
Twilio or Meta. The current new-console Twilio trial restricts outgoing messages
to provided templates; it is not a validated route for custom AI conversations.
Account credential verification is not evidence of successful message delivery.

The instructions below are **future integration notes**, not steps needed for the
hackathon presentation. Live rollout requires explicitly setting
`WHATSAPP_PILOTING=false`, completing provider validation, and deliberately
reintroducing the live controls. Live testing and activation are deferred.

## Private setup

1. In the [legacy Twilio Sandbox](https://www.twilio.com/console/sms/whatsapp/sandbox),
   send the displayed `join …` phrase from your own WhatsApp account to the exact
   Sandbox number shown. Wait for the joined-Sandbox confirmation. Each teammate
   acting as a vendor must do this too.
2. Fill `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_WHATSAPP_FROM` in
   `backend/.env`. Use the Sandbox sender number, including its country code.
   Keep `WHATSAPP_PROVIDER=twilio`, `WHATSAPP_ENABLED=false` for now. Never commit
   `.env`, put credentials in frontend settings or paste the Auth Token into chat.
3. Start the backend on loopback port 8000, then the callback-only proxy:

   ```sh
   cd backend
   .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
   # In a second terminal, from backend:
   .venv/bin/uvicorn webhook_proxy:app --host 127.0.0.1 --port 8001
   ```

4. Use an HTTPS tunnel or hosted reverse proxy targeting **127.0.0.1:8001**.
   Do not tunnel port 8000 or the entire planner: 8001 exposes only messaging
   callbacks. Set `TWILIO_PUBLIC_BASE_URL` to its HTTPS origin, without a path.
   A temporary tunnel URL changes when restarted; update both the environment
   setting and Twilio whenever that happens.
5. In Sandbox Settings, set **When a message comes in** to
   `https://YOUR-ORIGIN/webhooks/twilio/whatsapp`, method **POST**, then save.
   The app supplies `/webhooks/twilio/status` as `StatusCallback` on each outgoing
   message. If the console offers a status-callback field, use that URL and POST.
6. Set `WHATSAPP_ENABLED=true`, restart the backend and check `/controller`.
   The worker verifies the Twilio account without sending a message. Account
   verification does not prove sender membership, conversation access or billing.

The [new Console trial](https://www.twilio.com/docs/usage/trials/try-out-whatsapp)
can be restricted to Twilio-provided ContentSid templates. Such a trial cannot
run arbitrary AI follow-ups through this Body-based demo. Joining the legacy
Sandbox is the intended route; a provider rejection remains visible in delivery
records. Do not assume an account is unrestricted just because credentials work.

## First conversation

1. Complete and confirm the wedding brief with a specific date in `/planner`.
2. Add a **WhatsApp** vendor in `/controller`, using your own joined test number
   first. Fictional catering packages never become live contacts automatically.
3. Choose that vendor in the WhatsApp section. Enter the individual E.164 number
   (for example, `+6581234567`), record their opt-in, tick the consent checkbox,
   choose automatic enquiries and follow-ups, and save the permission.
4. **After the callback is configured and the contact is connected**, send a fresh
   `Hi` from that phone to the Sandbox. The earlier `join …` confirmation alone
   cannot provide the app with an authenticated, recorded conversation window.
5. The worker sends a bounded availability enquiry. Reply as the vendor to test
   one follow-up at a time. The dashboard records the original reply and actual
   provider delivery states. `Accepted` means Twilio accepted the request;
   `Delivered` and `Read` require callbacks.

The Sandbox sends custom text only inside the 24-hour window following the
participant's latest original message. Outside that window, this implementation
waits for a fresh inbound message; it does not misuse generic Sandbox templates
as wedding enquiries. Sandbox membership expires and provider limits may change:
see [Twilio Sandbox documentation](https://www.twilio.com/docs/whatsapp/sandbox).
Twilio and AI usage consume your account allowance or credit.

## Automatic authority

- Automatically send a fixed availability enquiry and bounded questions about
  itemised quotes, menu options and setup requirements.
- AI classifies replies into a validated schema. Free-form model output is never
  sent automatically. The AI sees the date, location, guest count, vendor category
  and up to six live messages; API credentials are excluded.
- Bookings, payments, cancellations, negotiations and changed terms require a
  user decision. These requests pause automatic follow-ups. The couple can write
  a draft and explicitly approve its exact text and recipient.
- At most three automatic messages and six reply analyses per vendor in a rolling
  24 hours. Automatic reminders and unrestricted tool loops are not implemented.
- `STOP` disables that conversation and cancels queued messages. `START` clears
  the opt-out, but the couple still needs to re-enable permission. `HUMAN`, `HELP`
  or `AGENT` switches to review mode. An already dispatched message cannot be recalled.
- Brief, recipient, account or permission changes invalidate pending dispatch.
  Reconfirm the latest brief and review the vendor's permission before resuming.
- Timeouts and worker crashes become **uncertain**; check Twilio/the phone before
  attempting a new message. Only definite rate-limit responses are retried, with
  a bound. An uncertain provider result is never blindly resent.

Availability inferred from a reply is a vendor claim with evidence, not a
confirmed booking. Full quote extraction, price comparison from real replies and
automatic re-planning remain separate unfinished work.

## API and storage

All `/api/weddings/{id}/messaging` routes require the wedding token:

| Method | Suffix | Purpose |
| --- | --- | --- |
| GET | `/messaging` | Safe setup state, permissions and delivery records; no credentials. |
| PATCH | `/messaging/vendors/{vendor_id}` | `{expected_revision, brief_revision, recipient, mode, opt_in, consent_note}`. Modes: off, review, automatic. |
| POST | `/messaging/vendors/{vendor_id}/drafts` | `{brief_revision, content}`; create a real-message draft without sending. |
| POST | `/messaging/messages/{message_id}/send` | `{brief_revision, binding_revision, expected_content}`; approve the exact draft once. |

Public callbacks are `/webhooks/twilio/whatsapp` and `/webhooks/twilio/status`.
Their canonical public URL and all form fields are verified against
`X-Twilio-Signature`, then the configured account/sender are checked. Incoming
message timestamps and identities are also checked against Twilio's API.
Unknown senders are ignored, duplicate message IDs are deduplicated and the
callback proxy forwards no wedding tokens.

SQLite holds opt-in notes, original vendor text, provider IDs, delivery records,
bounded analysis jobs and the durable outbox. One worker lease per account avoids
parallel dispatch. Use persistent private storage. The current prototype allows
one account/recipient conversation to belong to only one vendor/wedding, because
unthreaded WhatsApp replies cannot safely distinguish simultaneous weddings.

An optional direct Meta adapter exists for separately configured Cloud API
accounts and exact approved availability templates. Twilio Sandbox is the tested
demo path; neither adapter has been verified against a live account by automated
tests. All automated transport tests use mocks and spend no credits.

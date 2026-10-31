# Vendor research and comparison

The `/coordinator` website now starts with the vendor research workspace. Add vendors to the directory, prepare an enquiry, review it in the outbox, and share it with the vendor. The enquiry asks for date availability, stock/capacity, item/package options, itemised prices, currency and units, taxes, delivery/other fees, exclusions, quote expiry and conditions. It explicitly makes no reservation or commitment. Follow-up drafts ask for missing information; they also require review.

WhatsApp communication remains a **manual handoff**, not an authenticated API connection. The user copies an approved enquiry into their vendor group and records replies. Telegram remains simulated. There is no incoming provider webhook or automatic live vendor sending.

## Evidence and summaries

Paste the exact original vendor reply. Either record exact excerpts manually or click **Extract facts with AI**. The configured Claude/OpenAI provider can extract excerpts into availability, stock, pricing, options and conditions fields. Every nonempty extracted field must be an exact substring of the original reply, enforced server-side. Unsupported output fails without modifying the evidence. Without an AI key, manual excerpt entry and reports work normally.

Reports show each vendor's latest reply for the current wedding brief. They do not combine an old quote with new stock information silently. Missing fields show **Not provided** and produce follow-up questions. Original current replies are available in expandable evidence sections; full recorded replies also remain in conversation history. Replies from an older wedding revision are counted as outdated and excluded from current facts until reconfirmed.

A report token binds the current wedding revision, vendor directory and source evidence. No vendor is ranked, recommended or selected automatically. Prices are retained as vendor-stated text rather than summed or normalised across incompatible units, currencies, taxes and scopes. Vendor claims are not independently verified.

## User decision boundary

Only the explicit **Record my choice** form saves a user preference. The user chooses vendor, preferred date and option/package and acknowledges that they will handle final confirmation and payment directly. A stale report or response from another vendor is rejected. Recorded choices have `selected_by=user`, `status=user_choice_only`, `booking_confirmed=false` and `payment_handled=false`. They are decision history; new evidence flags older choices for review.

There is no API to confirm bookings, make purchases, collect payment credentials or pay vendors. Recording a preference triggers no outgoing confirmation message and no automatic task completion. Existing reminders/checklists remain separate utilities.

## API

All routes below are relative to `/api/weddings/{id}/coordination` and require `X-Wedding-Token`:

- `POST /vendors/{vendor_id}/enquiry`: optional `requirements`; creates a review-required enquiry. Repeated identical requests for the same evidence snapshot are deduplicated.
- `POST /vendors/{vendor_id}/evidence`: `content` plus optional exact excerpts `availability_detail`, `stock_detail`, `pricing_detail`, `options_detail`, `conditions_detail`.
- `POST /vendors/{vendor_id}/evidence/{response_id}/summarize`: source-validated AI extraction; provider configuration required. No action tools are supplied to the model.
- `GET /report`: source-linked facts, missing fields, original responses, unranked summaries, user-choice history and a report token.
- `POST /user-selection`: `vendor_id`, `response_id`, `report_token`, optional `chosen_date`, `chosen_option`, `notes`. Saves only the user's preference.

Tests exercise missing facts, unsupported excerpts, stale quotes, cross-vendor choices, source links, AI extraction failures and the absence of implicit booking/payment actions. Live paid model inference remains untested; provider tests use fakes.

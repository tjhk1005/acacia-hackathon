# Ever After 0.2.0 — Vercel deployment

This release is based on the latest integrated `main`, preserving the quiz, planner, shared controller, vendor discovery, schedule decisions and vendor outreach pilot.

## Required setup (one time)

1. Import the repository root into Vercel. Deploy `main` or `codex/vercel-release`.
2. In the project's **Storage / Marketplace**, connect a PostgreSQL provider such as Neon or Supabase. Enable the connection for the backend service and the deployment environments you use.
3. Supply the provider's PostgreSQL connection string as `DATABASE_URL` (or `POSTGRES_URL`) to the backend. Keep the provider's recommended TLS settings. Use secure Vercel settings; never paste the URL into chat or Git.
4. Redeploy. Tables are initialized automatically. Existing SQLite records are not automatically migrated.
5. Optional: configure Claude/OpenAI for AI chat. Without a key, brief editing, vendor/sample workflows and the planning dashboard remain available.

**No external database has been provisioned by this code change.** Without a database URL, the Vercel backend returns a clear `database_not_configured` setup response instead of writing ephemeral SQLite files and losing weddings. Local development and tests may continue using SQLite.

## Services and routing

- `app`: public Next.js frontend at `.`.
- `backend`: internal FastAPI service at `backend`, entry point `index.py`.
- `app` has a service binding to `backend` injected as `BACKEND_URL`. Do not set that variable manually.
- Public traffic goes to `app`. Its Node.js `/planning-api/*` handler reads the binding at runtime and forwards supported planning endpoints.
- `/api/inspiration` stays on Next.js. The old `/coordinator` bookmark redirects to `/controller`.
- Provider `/webhooks/whatsapp`, `/webhooks/twilio/whatsapp` and `/webhooks/twilio/status` requests are forwarded with their signature headers and raw body. Existing backend signature checks remain authoritative. No live provider credentials are installed by this release.

The planner opens independently of backend health checks. Missing saved weddings produce a recovery notice without deleting the browser-saved quiz. Mobile navigation remains visible.

## Storage verification

The PostgreSQL integration tests create isolated schemas and verify independent backend instances, authenticated wedding reads, revision conflicts, checklist decisions and idempotent events. Run them with a disposable test connection:

```sh
TEST_DATABASE_URL='<test PostgreSQL URL>' pytest -q backend/tests/test_postgres.py
```

Do not point tests at a production database. GitHub Actions starts its own PostgreSQL service.

## Remaining limits

Vercel functions do not provide a continuously running worker. Automatic live provider delivery still requires a dedicated worker or durable scheduled-job integration; a background loop must not be treated as guaranteed serverless scheduling. The user makes final vendor, date and package decisions and handles booking confirmation and payment directly.

Hosted verification requires access to the actual Vercel deployment and its private environment settings. A local build, Git push and PostgreSQL integration test do not establish hosted readiness. Do not use `/tmp` SQLite as production storage.

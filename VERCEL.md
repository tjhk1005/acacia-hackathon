# Vercel multi-service import

Import the repository root. `vercel.json` declares the Next.js `app` service at `.` and the FastAPI `backend` service at `backend`. The Python service entry point is `backend/index.py`.

Routing:

- `/planning-api/*` goes to FastAPI. The entry middleware removes `/planning-api`, so the existing frontend requests reach `/health` and `/api/weddings/...` correctly.
- Direct `/api/weddings*` and `/health` requests also go to FastAPI.
- All other paths go to Next.js, including the homepage, `/planner`, `/vendors`, `/coordinator` and the Pinterest endpoint `/api/inspiration`.
- Local development retains the Next.js rewrite to `PLANNING_API_URL` (default `http://127.0.0.1:8000`). On Vercel, the root multi-service router handles that prefix instead.

## Backend prerequisites before testing

The backend currently creates its SQLite database during import. Its default repository-relative `backend/data/weddings.sqlite3` is not suitable for Vercel's read-only deployment filesystem.

For a **disposable demo only**, set the backend environment variable `DATABASE_PATH=/tmp/ever-after/weddings.sqlite3`. This permits writes in a function instance, but data is temporary and is NOT shared across instances. Wedding sessions, vendor records and schedules may disappear or be unavailable on another request. Do not use this configuration for real couples or vendor coordination.

Reliable deployment requires migrating the backend to shared durable storage, or running this FastAPI service on a host with persistent storage. The current 15-second background reminder loop also requires a continuously running worker; Vercel functions cannot provide that guarantee. A durable scheduled job system is needed before relying on automatic reminders on Vercel.

Configure the selected AI provider server-side using `backend/.env.example` as the list of variable names. Do not commit keys or expose them through `NEXT_PUBLIC_` variables. Manual evidence entry and comparisons work without an AI key, subject to the storage limitation above. Pinterest access is optional and belongs on the frontend service as `PINTEREST_ACCESS_TOKEN`.

This configuration does not provision storage, deploy services, configure secrets, enable live WhatsApp or publish the environment. The multi-service syntax follows the import configuration supplied by Vercel in this task; fetching Vercel's schema/documentation was blocked by the current environment network policy, so hosted import validation remains outstanding.

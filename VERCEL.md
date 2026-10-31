# Vercel multi-service configuration

Confirmed services:

- `app`: Next.js at repository root `.`; public through the catch-all rewrite `/(.*)`.
- `backend`: FastAPI at `backend`; internal only, with no top-level public rewrite targeting it. Entry point: `backend/index.py`.
- Binding on the caller `app`: `{ "type": "service", "service": "backend", "format": "url", "env": "BACKEND_URL" }`.

Vercel injects `BACKEND_URL`. **Do not set it yourself** in project environment variables or `.env` files. It is a server-side binding, not a `NEXT_PUBLIC_` variable. The user confirmed these service names, public exposure and binding.

## Runtime routing

The browser continues to request `/planning-api/health` and `/planning-api/api/weddings/...` on the website domain. The Next.js Node.js route handler at `app/planning-api/[...path]/route.ts` calls `lib/backend-proxy.ts`, which reads `BACKEND_URL` inside the request handler. It removes `/planning-api/` and forwards only the existing planning endpoints, request bodies, content type and wedding access token. It disables caching and does not forward browser cookies or internal redirect URLs.

The binding is not read during build, in middleware or in `next.config.ts`. `next.config.ts` no longer defines a build-time backend rewrite. The frontend service owns `/api/inspiration` as before. Direct public `/api/weddings/...`, `/health` and backend `/docs` are not exposed by this configuration; use `/planning-api/...` for the supported planning API.

For development outside `vercel dev`, start FastAPI on port 8000 and Next.js using `pnpm dev`. The runtime proxy uses local `PLANNING_API_URL` if supplied, otherwise `http://127.0.0.1:8000`. On Vercel, a missing binding fails with 503 rather than silently calling localhost or the development URL.

## Validate using Vercel

From the repository root, run:

```sh
vercel dev
```

This is the intended multi-service test because it starts the services together and injects their bindings. It may require Vercel account login/project linking. Do not manually supply `BACKEND_URL` to imitate a successful Vercel integration. Local proxy unit checks and a Next.js build do not establish hosted service routing or binding readiness.

## Persistent storage and reminders remain prerequisites

The backend currently creates SQLite storage during import. Its default repository-relative `backend/data/weddings.sqlite3` is unsuitable for Vercel's read-only filesystem. For a **disposable demo only**, `DATABASE_PATH=/tmp/ever-after/weddings.sqlite3` permits temporary writes, but records are not durable or shared between function instances. Wedding sessions, reports and schedules can disappear or be unavailable on another request. Do not use that setup for real wedding coordination.

Reliable deployment requires shared durable storage or a backend host with persistent storage. The background reminder worker also needs durable scheduling; Vercel request-scoped functions do not guarantee that the current continuously running loop remains active.

Configure AI provider credentials securely on the server using `backend/.env.example` as the variable-name reference. Manual vendor evidence/report workflows work without a provider key, subject to the storage limitations. Optional `PINTEREST_ACCESS_TOKEN` is used by the frontend service. No deployment, account login, secrets, storage or live WhatsApp integration are provisioned by these files.

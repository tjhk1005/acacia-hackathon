# Hackathon deployment

The Vercel frontend and Python planning backend are separate processes. Pushing
the frontend does not deploy SQLite or the AI adapters.

## Current temporary connection

The owner explicitly approved a Cloudflare Quick Tunnel for the hackathon demo.
`demo-backend.json` records its public HTTPS origin; it contains no credentials.
On Vercel, a missing or loopback `PLANNING_API_URL` uses this demo origin. Local
development continues to use `http://127.0.0.1:8000`. A valid HTTPS hosted backend
configured through `PLANNING_API_URL` takes priority. Redeploy after changing it.

The demo requires all three local processes to remain running:

1. FastAPI on loopback port 8000, using the existing private SQLite database.
2. `backend/demo_gateway.py` on loopback port 8002.
3. The approved Cloudflare tunnel targeting port 8002.

The laptop must remain awake and connected. The gateway expires after 24 hours;
the Cloudflare URL stops working when the tunnel stops and changes on restart.
After restarting, update `demo-backend.json` and redeploy, or configure a durable
backend instead. This connection is temporary and has no production uptime guarantee.

The gateway exposes `/health` and planning API routes only. It excludes developer
pages, OpenAPI, the standalone coordinator and messaging webhooks. Wedding access
tokens are forwarded unchanged; the existing backend checks them before accessing
saved records. Incoming cookies and unrelated credentials are not forwarded.
Public calls have a 1 MB body limit and global limits of 600 requests/minute,
120 writes/minute, 60 wedding creations/hour and 30 AI requests/hour. AI calls run
one at a time. Rejected wedding authentication does not consume the AI budget.
Rate-limit responses ask users to retry later. AI keys remain in `backend/.env`.
WhatsApp remains locked in piloting mode.

Wedding briefs, chat and vendor records pass through Cloudflare over this approved
connection. They remain stored in the private SQLite database on the laptop.

## Permanent hosting

Host the FastAPI backend on a service with persistent storage for SQLite and run
one backend instance. Configure its AI credentials privately on that host. Set
`DATABASE_PATH` to its persistent disk, keep `WHATSAPP_PILOTING=true`, then set
Vercel's `PLANNING_API_URL` to its HTTPS origin and redeploy. For multiple backend
instances, migrate to a shared database first. Do not use Vercel's temporary
filesystem as persistent SQLite storage.

## GitHub/Vercel identity

Future commits must use the authenticated contributor's actual GitHub identity
and a GitHub-linked email. Do not impersonate another contributor or rewrite
published history to work around access checks. Current `main` includes the pilot,
schedule approvals and the latest teammate changes. Its new merge commit was
accepted and deployed successfully by both connected Vercel projects.

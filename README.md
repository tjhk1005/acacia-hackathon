# Ever After

A wedding planning website for the Acacia hackathon. The current milestone is a working frontend for capturing a couple's wedding brief.

## Run locally

Use Node.js 20.9 or newer and pnpm.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3000.

```sh
pnpm typecheck
pnpm build
```

## What works

- Three-step onboarding: wedding essentials, visual direction and personal priorities.
- Input validation for names, location, guest count, budget and date.
- Three original SVG concept illustrations with colour palettes.
- Wedding brief summary, browser-local persistence, editing and JSON download.
- Responsive layouts for mobile and desktop.

No API keys or paid services are required for this milestone. Google Fonts is used for optional typography, with system fallbacks.

## Next milestones

- Vendor catalogue and comparisons, with explicit quote and availability states.
- Vendor response forms, checklist and in-app messaging.
- Database, authentication and AI integration.

The team's AI guardrails document will define planner permissions and approval requirements before autonomous actions are implemented. This preview does not call an AI, contact vendors, make bookings or transmit the wedding brief. Browser storage is local to the current browser profile, not a cross-device backup.

## Vercel

Import `tjhk1005/acacia-hackathon`, select the Next.js framework, and use the repository root. No environment variables are needed for the current frontend. The pnpm lockfile identifies the dependency manager. Deployment has not been configured by this change.

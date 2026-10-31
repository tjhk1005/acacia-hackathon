# Ever After

A wedding planning website for the Acacia hackathon. The current milestone is a working frontend for capturing a couple's wedding brief.

## Run locally

Use Node.js 22.18 or newer and pnpm (the test runner uses native TypeScript support).

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3000.

```sh
pnpm typecheck
pnpm test
pnpm build
```

## What works

- Guided onboarding: wedding essentials, broad setting, specific direction, editable decor decisions and personal priorities.
- Input validation for names, location, guest count, budget and date.
- Real wedding reference photos with photographer attribution and contextual Pinterest discovery links.
- Eight broad settings and eight specific directions per setting, showing four choices at a time.
- Refresh replaces all four options with a disjoint set of photos and different decor plans. After all eight options are explored, users can explicitly revisit earlier ideas or change their setting; the interface never silently recycles rejected options.
- A feeling prompt surfaces relevant starting points from the curated catalogue.
- Editable flower, lighting and table preferences, a complete vision summary, and practical next planning steps.
- Wedding brief summary, browser-local persistence, editing and JSON download.
- Responsive layouts for mobile and desktop.

No API keys or paid services are required for this milestone. Photos are served locally and Google Fonts is used for optional typography, with system fallbacks. See [photo credits](public/inspiration/README.md) for original sources and licensing.

The catalogue is curated, not a live Pinterest feed or a measured popularity ranking. The initial four broad starting points are Garden, Beach, Classic and Modern; keyword matching can surface other relevant settings. Pinterest links open searches for the chosen setting, direction or decor detail.

Existing first-draft wedding briefs are preserved, with the former `coastal` setting migrated to `beach`. Couples with an older brief are invited to refine a specific direction instead of losing their details. Downloaded briefs include the chosen direction, explicit decor preferences and inspiration source links.

## Next milestones

- Vendor catalogue and comparisons, with explicit quote and availability states.
- Vendor response forms, checklist and in-app messaging.
- Database, authentication and AI integration.

The team's AI guardrails document will define planner permissions and approval requirements before autonomous actions are implemented. This preview does not call an AI, contact vendors, make bookings or transmit the wedding brief. Browser storage is local to the current browser profile, not a cross-device backup.

## Vercel

Import `tjhk1005/acacia-hackathon`, select the Next.js framework, and use the repository root. No environment variables are needed for the current frontend. The pnpm lockfile identifies the dependency manager. Deployment has not been configured by this change.

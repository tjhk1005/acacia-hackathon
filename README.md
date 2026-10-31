# Ever After

A wedding planning website for the Acacia hackathon. Couples can shape a visual wedding brief and refine it through one preferences-agent conversation at `/planner`.

## Run locally

Use Node.js 22.18 or newer and pnpm (the test runner uses native TypeScript support).

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3000.

To use **Your planner**, run the Python backend in a second terminal; see [backend setup](backend/README.md).
Next.js forwards `/planning-api/*` to `http://127.0.0.1:8000` by default. Set `PLANNING_API_URL`
in the website's `.env.local` to use a different backend, then restart Next.js. Hosted deployments
need a reachable backend URL with persistent storage; pushing code alone doesn't deploy that service.

For Claude, set `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` in
`backend/.env`, then restart the backend. The default Claude model is `claude-haiku-5-5`.
OpenAI is also supported with `AI_PROVIDER=openai`, `OPENAI_API_KEY` and `OPENAI_MODEL`.
No AI key belongs in the website or any `NEXT_PUBLIC_` variable. Without a key, the
planner clearly explains the connection state and still supports manual brief editing and confirmation.

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
- One chat interface backed by the preferences agent, with saved conversation history, follow-up questions and a live brief panel.
- Manual brief editing and explicit confirmation; meaningful changes return a confirmed brief to draft.
- The current setting, direction and decor are preserved across chat updates. Returning from visual onboarding with a different saved brief prompts the couple to choose which version to keep.
- Pending chat input survives failures, completed requests can be retried without duplicating stored turns, and revision conflicts refresh the saved brief.

No API keys or paid services are required for visual onboarding or manual brief editing. AI chat requires a configured API account. Photos are served locally and Google Fonts is used for optional typography, with system fallbacks. See [photo credits](public/inspiration/README.md) for original sources and licensing.

The catalogue is curated, not a live Pinterest feed or a measured popularity ranking. The initial four broad starting points are Garden, Beach, Classic and Modern; keyword matching can surface other relevant settings. Pinterest links open searches for the chosen setting, direction or decor detail.

Existing first-draft wedding briefs are preserved, with the former `coastal` setting migrated to `beach`. Couples with an older brief are invited to refine a specific direction instead of losing their details. Downloaded briefs include the chosen direction, explicit decor preferences and inspiration source links.

## Next milestones

- Vendor catalogue and comparisons, with explicit quote and availability states.
- Vendor response forms, checklist and in-app messaging.
- Account login/invites and production hosting. Persistence and preferences-agent integration are implemented; live model quality needs verification with the team's API key.

Visual onboarding is local to the browser until the couple chooses to start or sync a planner conversation. The planner saves the brief and chat in the backend; sending a chat message sends the saved brief and recent messages to the configured AI provider. No vendors are contacted and no bookings are made. A prototype per-wedding access token is held in tab session storage. Full account login, invites and recovery are not implemented; keep the development service local. See [API contract](backend/API.md).

## Vercel

Import `tjhk1005/acacia-hackathon`, select the Next.js framework, and use the repository root. The pnpm lockfile identifies the dependency manager. Set `PLANNING_API_URL` to your separately hosted backend for planner functionality. Deployment has not been configured by this change.

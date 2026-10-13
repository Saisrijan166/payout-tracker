# Meme'd Campaign Payout Tracker

[![CI](https://github.com/Saisrijan166/payout-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/Saisrijan166/payout-tracker/actions/workflows/ci.yml)

Brands run campaigns on Instagram or YouTube with a fixed budget and a **milestone ladder** (for example 10K views → ₹500, 50K → ₹2,000, 100K → ₹5,000). Creators submit their posts, and as view counts arrive each post is paid the payout of the **highest milestone it has crossed**. A campaign never pays out more than its budget, even when updates arrive at the same time.

| | Link |
|---|---|
| Web app (Vercel) | https://payout-tracker-ruddy.vercel.app |
| API health (Render) | https://memed-payouts-api.onrender.com/api/health |

**Demo accounts** (password `Password123!` for all three; the login page has a card that fills them in for you):

| Role | Email | Name |
|---|---|---|
| Brand | `brand@memed.test` | Acme Snacks |
| Creator | `creator@memed.test` | Desi Meme Lord |
| Creator | `creator2@memed.test` | Clip Central |

> The API runs on Render's free tier, which sleeps when idle. The first request after a quiet spell can take 30 to 60 seconds; the app shows a "waking up" hint while it waits.

## Contents

- [How the brief is covered](#how-the-brief-is-covered)
- [Try it live](#try-it-live)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Run it with Docker](#run-it-with-docker)
- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [API](#api)
- [How payouts work](#how-payouts-work)
- [Assumptions and edge cases](#assumptions-and-edge-cases)
- [Tests](#tests)
- [Project structure](#project-structure)
- [Deployment](#deployment)
- [Scaling](#scaling)
- [Known limitations](#known-limitations)

## How the brief is covered

| Brief item | Status | Where |
|---|---|---|
| JWT signup and login, `brand` and `creator` roles | Done | [`modules/auth`](backend/src/modules/auth), [`middleware/auth.ts`](backend/src/middleware/auth.ts) |
| Brand: create a campaign (name, platform, budget, milestone ladder) | Done | `POST /api/campaigns`, [`CampaignForm.tsx`](frontend/src/components/CampaignForm.tsx) |
| Brand: budget spent vs remaining per campaign | Done | `GET /api/campaigns/mine`, `GET /api/campaigns/:id`, [brand dashboard](frontend/src/app/brand/page.tsx) |
| Creator: list live campaigns, submit a post, see total earnings | Done | `GET /api/campaigns`, `POST /api/submissions`, `GET /api/submissions/mine`, [creator dashboard](frontend/src/app/creator/page.tsx) |
| `PATCH /api/submissions/:id/views` with no role check | Done | [`views.service.ts`](backend/src/modules/submissions/views.service.ts), [API](#api) |
| Payout = highest milestone crossed | Done | [`domain/payout.ts`](backend/src/domain/payout.ts), [How payouts work](#how-payouts-work) |
| Never pay more than the remaining budget | Done | `planPayout` plus the database guard in `reserveBudget` |
| Frontend: login/signup, brand page, creator page (Next.js + TypeScript) | Done | [`frontend/src/app`](frontend/src/app) |
| Jest unit tests for payout calculation and the budget cap | Done | [`tests/unit/payout.test.ts`](backend/tests/unit/payout.test.ts), [Tests](#tests) |
| Deployed on free tiers | Done | Vercel, Render and MongoDB Atlas: [links above](#memed-campaign-payout-tracker), [Deployment](#deployment) |
| README with setup, env vars and assumptions; `.env.example` files | Done | This file, [`backend/.env.example`](backend/.env.example), [`frontend/.env.example`](frontend/.env.example) |
| Open questions (two milestones in one update, budget running out) decided and noted | Done | [Assumptions and edge cases](#assumptions-and-edge-cases) |
| **Bonus:** cache the campaign list with Redis | Built; used in docker-compose; **disabled in production** (the brief says it needn't be deployed) | [`campaigns.cache.ts`](backend/src/modules/campaigns/campaigns.cache.ts), [`lib/redis.ts`](backend/src/lib/redis.ts) |
| **Bonus:** flag submissions whose views spike | Done | [`domain/spike.ts`](backend/src/domain/spike.ts) |
| **Stretch:** simultaneous updates never overspend; repeats never double-pay | Done, enforced in MongoDB | [Concurrency and idempotency](#concurrency-and-idempotency), [`concurrency.test.ts`](backend/tests/integration/concurrency.test.ts) |
| **Stretch:** dockerise the app | Done | [`docker-compose.yml`](docker-compose.yml), [`backend/Dockerfile`](backend/Dockerfile), [`frontend/Dockerfile`](frontend/Dockerfile) |
| **Stretch:** note on scaling to 10,000 creators (half a page) | Done | [SCALING.md](SCALING.md) |

## Try it live

This uses the demo accounts on the live site and `curl` plus `jq` against the live API.

1. **Brand creates a campaign.** Open https://payout-tracker-ruddy.vercel.app, click the **Brand** row in the Demo accounts card, then **Log in**. In **New campaign**, enter a name and a budget of `6000`, keep the default ladder (10K → ₹500, 50K → ₹2,000, 100K → ₹5,000) and click **Create campaign**.
2. **Creator submits a post.** Log out, log in with the **Creator** row (`creator@memed.test`), find your campaign under **Live campaigns** and submit a made-up post link such as `https://www.instagram.com/p/TryIt12345/`. Each post can only be submitted once across the whole app, so change the code if it is taken.
3. **Get the submission id.** Your new post is the creator's newest submission:
   ```bash
   API=https://memed-payouts-api.onrender.com/api
   TOKEN=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
     -d '{"email":"creator@memed.test","password":"Password123!"}' | jq -r .token)
   SUB=$(curl -s "$API/submissions/mine" -H "Authorization: Bearer $TOKEN" | jq -r '.submissions[0].id')
   echo "$SUB"
   ```
4. **Send a view count.** This endpoint needs no token; it simulates platform data:
   ```bash
   curl -s -X PATCH "$API/submissions/$SUB/views" -H 'Content-Type: application/json' \
     -d '{"views":60000}' | jq '{payout, campaign}'
   ```
   60K views crosses two milestones but pays only the highest: `"paidNow": 2000` (not ₹2,500), and the campaign shows `"spent": 2000, "remaining": 4000`. Send `60000` again and `paidNow` is `0`; send `55000` and you get `409 VIEWS_DECREASED`.
5. **See the payout and budget update.** Refresh the creator dashboard: **Total earned** has gone up by ₹2,000 and the post shows **Paid ₹2,000**, with a **Flagged** badge because the views jumped so fast. Log back in as the brand: the campaign shows ₹2,000 spent and ₹4,000 remaining, and **View submissions** lists the post.

You can also skip the terminal: the creator's **My submissions** table has a **Simulate views** control that calls the same endpoint.

## Features

- **Auth:** JWT signup and login with two roles, `brand` and `creator`.
- **Brands:** create a campaign (name, platform, total budget, milestone ladder) and see budget spent against remaining for each campaign, with every submission's views, earnings and flags.
- **Creators:** browse live campaigns, submit a post link, and see total earnings, including any amount left unpaid because a budget ran out.
- **Views and payouts:** `PATCH /api/submissions/:id/views` simulates platform data. It pays only the newly earned amount, caps it by the remaining budget, and is safe under concurrent and repeated calls.
- **Interface:**
  - Toast notifications (success, error and info) report the result of every form: login, signup, campaign created, post submitted, views updated, and API errors such as a duplicate post or an exhausted budget. They stack top-right and hide themselves after about 4 seconds.
  - 10-per-page pagination with Prev/Next and "Page X of Y" on brand campaigns, campaign submissions, creator live campaigns and creator submissions. Paging happens in the browser because the API returns full lists.
  - A demo accounts card on the login page; clicking a row fills in the form.
  - The brand's campaign list sits in a fixed-height panel that scrolls on its own, with its header and pager kept in view.
  - A live password checklist on signup (8 to 72 characters, upper and lower case, a number, a special character, no spaces). This is checked in the browser only; the API itself enforces 8 to 72 characters.
  - Campaign form errors appear under the exact field or milestone row; hover tooltips explain flags, exhausted budgets and unpaid amounts; headings with one-line hints on every section; works on mobile.
- **Bonus:** Redis cache for the live campaign list (falls back to MongoDB when Redis is missing or down), and view-spike flagging.
- **Stretch:** concurrency and idempotency enforced in the database, Docker images with `docker-compose`, and a [scaling note](SCALING.md).

## Tech stack

| Area | Choice |
|---|---|
| Backend | Node.js 22, TypeScript (strict), Express 5, MongoDB with Mongoose 8, Zod, JWT, bcrypt, pino |
| Frontend | Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, SWR |
| Tests | Jest, ts-jest, supertest, mongodb-memory-server (in-memory replica set) |
| Cache | Redis 7 via ioredis (optional) |
| Ops | Docker, docker-compose, GitHub Actions CI, Render, Vercel, MongoDB Atlas |

## Run it with Docker

Requires Docker with Compose v2.

```bash
docker compose up --build
```

Then open **http://localhost:3000**. The API is on http://localhost:4000/api.

The stack runs MongoDB 7 as a single-node replica set (payouts use transactions, which need one), Redis, the API and the web app. The API uses a local-only fallback `JWT_SECRET`; to use your own, put `JWT_SECRET=<32+ characters>` in a `.env` file next to `docker-compose.yml` (it is git-ignored). To load the demo accounts and campaigns:

```bash
docker compose exec backend npm run seed:prod
```

Stop with `docker compose down` (add `-v` to delete the database volume).

> **Why MongoDB 7 and not 8?** MongoDB 8.x fails to start on Linux kernels 6.19 and newer ([SERVER-121912](https://jira.mongodb.org/browse/SERVER-121912)). Docker containers share the host kernel, so the compose file pins `mongo:7`. Atlas is not affected.

## Local development

Requires Node.js 22 (`nvm use` reads `.nvmrc`) and a MongoDB **replica set**: either the Docker one below or an Atlas cluster.

```bash
# 1. MongoDB 7 (replica set) and Redis from the compose file
docker compose up -d mongo redis

# 2. API on http://localhost:4000
cd backend
cp .env.example .env          # then set JWT_SECRET (generate one: openssl rand -hex 32)
npm install
npm run seed                  # optional demo data
npm run dev

# 3. Web app on http://localhost:3000 (new terminal)
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

The defaults in `backend/.env.example` point at the Docker MongoDB. To use Redis locally, set `REDIS_URL=redis://localhost:6379`. The API refuses to start if `JWT_SECRET` is missing or shorter than 32 characters, or if MongoDB is not a replica set, and says which.

## Environment variables

Both apps ship a `.env.example` that lists every variable the code reads.

### Backend (`backend/.env`)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MONGODB_URI` | yes | | MongoDB connection string. Must be a replica set (Atlas, or local Docker with `?directConnection=true`). |
| `JWT_SECRET` | yes | | Signing secret, at least 32 characters (`openssl rand -hex 32`). Empty in `.env.example` on purpose. |
| `JWT_EXPIRES_IN` | no | `1d` | Token lifetime: a number followed by `s`, `m`, `h` or `d`. |
| `BCRYPT_ROUNDS` | no | `10` | Password hashing cost (4 to 15). |
| `CORS_ORIGIN` | no | `http://localhost:3000` | Comma-separated list of allowed frontend origins. |
| `PORT` | no | `4000` | HTTP port (Render sets its own). |
| `NODE_ENV` | no | `development` | `development`, `test` or `production`. |
| `REDIS_URL` | no | *(empty)* | Redis for the campaign list cache. Empty disables the cache. |
| `CAMPAIGN_CACHE_TTL_SECONDS` | no | `30` | Cache lifetime for the live campaign list. |
| `SPIKE_MIN_GAIN` | no | `10000` | Views gained since the previous reading before a jump can be a spike. |
| `SPIKE_VIEWS_PER_MIN` | no | `1000` | Growth rate at or above which that jump is flagged. |
| `LOG_LEVEL` | no | `info` | pino log level. |
| `SEED_PASSWORD` | no | `Password123!` | Seed script only: password for the demo accounts it creates. |
| `TEST_REDIS_URL` | no | *(unset)* | Tests only: a running Redis enables the real-Redis cache tests. |

Configuration is validated with Zod at startup; the API exits with a list of problems if anything is invalid.

### Frontend (`frontend/.env.local`)

| Variable | Required | Example | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | yes | `http://localhost:4000/api` | API base URL. Inlined at build time, so rebuild after changing it. Production uses `https://memed-payouts-api.onrender.com/api`. |

## API

Base path `/api`. JSON in and out. Authenticated routes take `Authorization: Bearer <token>`.

| Method | Path | Who | Body | Returns |
|---|---|---|---|---|
| `GET` | `/health` | anyone | | `{ status, db, redis }` (503 if MongoDB is down) |
| `POST` | `/auth/signup` | anyone | `{ name, email, password, role }` | `201 { token, user }` |
| `POST` | `/auth/login` | anyone | `{ email, password }` | `{ token, user }` |
| `GET` | `/auth/me` | signed in | | `{ user }` |
| `POST` | `/campaigns` | brand | `{ name, platform, totalBudget, milestones: [{ views, payout }] }` | `201 { campaign }` |
| `GET` | `/campaigns` | signed in | | `{ campaigns }`: live only, newest first. `X-Cache: HIT \| MISS \| BYPASS` |
| `GET` | `/campaigns/mine` | brand | | `{ campaigns }` with `spent`, `remaining`, `submissionCount`, `flaggedCount` |
| `GET` | `/campaigns/:id` | brand (owner) | | `{ campaign, submissions }` |
| `POST` | `/submissions` | creator | `{ campaignId, postUrl }` | `201 { submission }` |
| `GET` | `/submissions/mine` | creator | | `{ summary: { totalEarned, totalEntitled, totalUnpaid, submissionCount }, submissions }` |
| `PATCH` | `/submissions/:id/views` | **anyone** (no role check, per the brief) | `{ views }` | `{ submission, payout, campaign }` |

Signup and login are limited to 50 requests per 15 minutes per IP, and view updates to 120 per minute per IP.

Every error uses one envelope:

```json
{ "error": { "code": "VIEWS_DECREASED", "message": "View count cannot go down (currently 60000)", "details": { "currentViews": 60000 } } }
```

| Status | Codes |
|---|---|
| 400 | `VALIDATION_ERROR` (with field `details`), `INVALID_ID`, `INVALID_MILESTONES`, `INVALID_POST_URL`, `PLATFORM_MISMATCH` |
| 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS` |
| 403 | `FORBIDDEN` (wrong role, or not the owner) |
| 404 | `NOT_FOUND`, `CAMPAIGN_NOT_FOUND`, `SUBMISSION_NOT_FOUND` |
| 409 | `EMAIL_TAKEN`, `DUPLICATE_SUBMISSION`, `CAMPAIGN_NOT_LIVE`, `VIEWS_DECREASED`, `CONCURRENT_UPDATE` (safe to retry) |
| 413 / 429 / 500 | `PAYLOAD_TOO_LARGE`, `RATE_LIMITED`, `INTERNAL_ERROR` |

Example view update and response:

```bash
curl -X PATCH http://localhost:4000/api/submissions/<id>/views \
  -H 'Content-Type: application/json' -d '{"views": 60000}'
```

```json
{
  "submission": { "id": "…", "views": 60000, "entitledAmount": 2000, "paidAmount": 2000, "unpaidAmount": 0, "flagged": true, "…": "…" },
  "payout": { "entitled": 2000, "paidNow": 2000, "paidTotal": 2000, "unpaid": 0 },
  "campaign": { "id": "…", "spent": 2000, "remaining": 4000, "status": "live" }
}
```

## How payouts work

The rules live in pure functions in [`backend/src/domain/payout.ts`](backend/src/domain/payout.ts) (no database, fully unit tested). The database layer in [`views.service.ts`](backend/src/modules/submissions/views.service.ts) makes them hold under concurrency.

### The rules

1. **Highest milestone crossed, not a sum.** A post with `views` earns the payout of the highest milestone whose threshold it has reached (`views >= threshold`). Jumping from 0 to 60K on the 10K/50K/100K ladder earns ₹2,000, not ₹2,500.
2. **Only the difference is paid.** `delta = entitled − alreadyPaid`. Crossing 10K pays ₹500; crossing 50K later pays ₹1,500 more. Replaying an update finds `delta = 0` and pays nothing, which makes the endpoint idempotent.
3. **The budget is a hard cap.** `grant = min(delta, totalBudget − spent)`. If the budget runs out mid-payout, the creator gets the partial remainder, the campaign becomes `exhausted`, and the rest is recorded as `unpaidAmount`.
4. **Views only move forward.** A lower count is rejected (`409 VIEWS_DECREASED`); the same count is a no-op. Nothing is ever clawed back.

### Concurrency and idempotency

Checking the budget in application code is not enough: two requests can both read `spent = 0` and both pay. So the guarantees sit in MongoDB:

- **Budget guard.** The campaign update only matches if the new total still fits, and sets `status` in the same atomic write:
  ```js
  Campaign.findOneAndUpdate(
    { _id, $expr: { $lte: [{ $add: ['$spent', grant] }, '$totalBudget'] } },
    [{ $set: { spent: { $add: ['$spent', grant] } } },
     { $set: { status: { $cond: [{ $gte: ['$spent', '$totalBudget'] }, 'exhausted', '$status'] } } }],
  )
  ```
- **Double-pay guard.** The submission update only matches if `views` and `paidAmount` are still the values the payout was planned from, so two identical updates cannot both pay the same delta.
- **One transaction.** Both writes run in a MongoDB transaction, so `campaign.spent` always equals the sum of its submissions' `paidAmount`. Concurrent transactions on the same documents hit a write conflict and are retried by the driver. If a guard matches nothing, the service re-reads and tries again (up to 3 times) before returning `409 CONCURRENT_UPDATE`.

These invariants are asserted against the stored data after every concurrency test: `spent ≤ totalBudget`; `spent = Σ paidAmount`; `0 ≤ paidAmount ≤ entitledAmount`; views and payments only move forward; and `status = exhausted` exactly when `spent = totalBudget`.

### Worked example

Ladder 10K → ₹500, 50K → ₹2,000, 100K → ₹5,000. Budget ₹6,000.

| Step | Update | Entitled | Paid now | Spent after | What happened |
|---|---|---|---|---|---|
| 1 | A: 0 → 60K | ₹2,000 | ₹2,000 | ₹2,000 | Two milestones crossed; only the highest is paid |
| 2 | A: 60K → 60K | ₹2,000 | ₹0 | ₹2,000 | Repeat: no-op |
| 3 | A: 60K → 55K | | | ₹2,000 | Rejected: `409 VIEWS_DECREASED` |
| 4 | B: 0 → 12K | ₹500 | ₹500 | ₹2,500 | |
| 5 | C: 0 → 120K | ₹5,000 | **₹3,500** | ₹6,000 | Budget runs out: partial payout, ₹1,500 unpaid, campaign **exhausted** |
| 6 | B: 12K → 70K | ₹2,000 | ₹0 | ₹6,000 | Views recorded, ₹1,500 unpaid |

This exact sequence is a unit test and an HTTP integration test.

## Assumptions and edge cases

Where the brief was open, these are the calls I made.

**Payouts and budget**

| Case | Decision |
|---|---|
| One update crosses several milestones | Pay only the highest milestone crossed, minus what was already paid. |
| Views exactly on a threshold | Counts as crossed (`>=`). |
| Views beyond the top milestone | Entitlement stays at the top payout. |
| Repeated or concurrent identical updates | Idempotent: the delta is paid exactly once. |
| Budget runs out mid-payout | Pay the partial remainder, mark the campaign `exhausted`, and show the shortfall as `unpaidAmount`. It is not owed later (there is no budget top-up feature). |
| Who gets paid when the budget is short | First come, first served, in the order updates commit. No pro-rata split. |
| Exhausted campaign | Hidden from the live list; new submissions get `409 CAMPAIGN_NOT_LIVE`; view updates are still recorded but pay ₹0. |
| Fewer views than before | `409 VIEWS_DECREASED`, nothing changes, no clawback. Platforms do occasionally revise counts down; a sync job would log and skip these. |
| Money | Whole rupees stored as integers (no paise), so partial payouts are always whole numbers. |

**Campaigns**

| Case | Decision |
|---|---|
| Ladder validation | 1 to 10 milestones; views and payouts are positive whole numbers; thresholds are unique; payouts strictly increase with views; the top payout is no more than the total budget. Every broken rule is reported (`400 INVALID_MILESTONES`). The form checks the same rules first and shows each message under the field or milestone row it is about. |
| Unsorted ladder | Accepted and stored sorted by views. |
| Editing a campaign | Not supported: the ladder and budget are fixed at creation so earned entitlements never change. |
| Campaign lifecycle | `live` until the budget is used up. The brief has no start or end dates. |
| List sizes and paging | The API returns full lists; the live campaign list is capped at the newest 100. The web app pages every long list 10 at a time in the browser. Cursor pagination is in the scaling note. |

**Submissions**

| Case | Decision |
|---|---|
| Duplicate posts | Each link is reduced to a canonical key (`instagram:<shortcode>` or `youtube:<videoId>`), unique across **all** campaigns. The same post spelled differently (`www.`/`m.`, tracking parameters, `/reel/` vs `/p/`, `youtu.be` vs `watch?v=`) is caught. A unique index settles simultaneous submissions. |
| Several posts from one creator in one campaign | Allowed; each is paid separately. |
| Accepted links | Instagram `/p/`, `/reel/`, `/reels/`, `/tv/` (optionally after a username); YouTube `watch?v=`, `/shorts/`, `/live/`, `/embed/`, `youtu.be/`. A link from the other platform gets `400 PLATFORM_MISMATCH`. |
| Post ownership | Not verified; that needs platform OAuth. The first claim wins. |
| `PATCH /views` access | No authentication or role check, as the brief says; it validates input and is rate limited (120 requests a minute per IP). In production this would be a signed webhook or an internal worker. |
| View spikes | Flagged when a post gains at least 10,000 views at 1,000 or more views a minute since its previous reading (elapsed time floored at one minute). Both thresholds are environment variables. The flag stays set, records a reason such as "+15,000 views in 5 min (3,000/min)", and is **informational**: the payout still goes through. Production would hold flagged payouts for review. |

**Auth and other**

| Case | Decision |
|---|---|
| Roles | One role per account, chosen at signup and immutable. Brands cannot submit; creators cannot create campaigns; brands see only their own campaigns' submissions. |
| Token storage | The JWT is kept in `localStorage` and sent as a Bearer header. The app and API are on different sites (Vercel and Render), where cookies would need third-party `SameSite=None`. Mitigations: React escaping, no raw HTML rendering, 1-day expiry. Production: a same-site cookie through a backend-for-frontend. |
| Passwords | The API accepts 8 to 72 characters (bcrypt reads only the first 72 bytes, so longer ones are rejected rather than silently truncated). The signup page also asks for upper and lower case, a number, a special character and no spaces through a live checklist; that is a browser-side nudge only, so other API clients just need 8 to 72 characters. Login returns the same error for an unknown email and a wrong password. |
| Campaign list cache | 30-second TTL, cleared when a campaign is created and after every payout (so remaining budgets stay current). Submissions always re-check campaign status in MongoDB. Not deployed in production, where the API reports `redis: disabled` and reads straight from MongoDB. |
| Dates and currency | Shown as DD-MM-YYYY and Indian digit grouping (₹1,00,000). |

## Tests

```bash
cd backend
npm test                 # all 157 tests (unit and integration)
npm run test:unit        # pure payout, ladder, URL and spike rules only
npm run test:coverage    # with coverage; src/domain must stay at 100%

# Include the real-Redis cache tests (skipped otherwise):
TEST_REDIS_URL=redis://localhost:6379 npm test
```

Integration tests start an in-memory MongoDB **replica set**, so transactions run for real. No setup is needed beyond `npm install` (the MongoDB binary downloads on first run).

| Area | What is covered |
|---|---|
| Payout calculation ([`payout.test.ts`](backend/tests/unit/payout.test.ts)) | Highest milestone crossed; several milestones in one update; inclusive thresholds; beyond the top rung; unsorted ladders |
| Budget cap | Delta-only payouts; repeated updates paying nothing; partial payout when the budget runs out; exact fit; already exhausted; never negative; a seeded 1,000-scenario randomised check that spending never exceeds the budget |
| View rules | Decreasing views rejected; same count is a no-op |
| Concurrency ([`concurrency.test.ts`](backend/tests/integration/concurrency.test.ts)) | Two and many simultaneous updates splitting a budget exactly; 20 identical simultaneous updates paying once; out-of-order increases; a seeded burst of mixed updates; the database guards refusing stale writes directly |
| API | Auth and role guards, validation errors, campaigns, submissions and duplicates, the worked example over HTTP, cache behaviour with Redis up, down and absent, spike flags |

The frontend has no unit tests; `npm run lint`, `npm run typecheck` and `npm run build` cover it in CI, and the brand and creator flows were checked end to end with scripted browser runs. CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs lint, typecheck, tests with coverage (including the Redis tests) and builds for both apps.

## Project structure

```
.
├── backend/
│   ├── src/
│   │   ├── domain/            # pure business rules, no I/O: payout.ts, milestones.ts, post-url.ts, spike.ts
│   │   ├── modules/
│   │   │   ├── auth/          # routes → controller → service; Zod schemas; JWT helpers
│   │   │   ├── campaigns/     # campaign endpoints, DTOs, Redis cache-aside helpers
│   │   │   └── submissions/   # submissions, earnings, views.service.ts (transactional payouts)
│   │   ├── models/            # Mongoose schemas: user, campaign, submission
│   │   ├── middleware/        # auth and role guards, central error handler, rate limits
│   │   ├── lib/               # db (replica-set check), redis, logger, AppError
│   │   ├── config/env.ts      # Zod-validated environment
│   │   ├── scripts/seed.ts    # idempotent demo data
│   │   ├── app.ts             # Express app factory (used by tests)
│   │   └── server.ts          # startup and graceful shutdown
│   ├── tests/                 # unit/, integration/, helpers/ (invariants, factories), setup/
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── app/               # pages: login, signup, brand, brand/campaigns/[id], creator
│   │   ├── components/        # CampaignForm, SubmissionsTable, SimulateViewsForm, Pagination, DemoAccounts, RequireRole, …
│   │   └── lib/               # API client, auth context, toasts, password rules, formatting, validation, types
│   └── Dockerfile
├── docker-compose.yml         # mongo (replica set), redis, backend, frontend
├── render.yaml                # Render blueprint for the API
├── SCALING.md                 # how this scales to 10,000 creators
└── IMPLEMENTATION_PLAN.md     # the build plan this project followed
```

## Deployment

What is live:

| Piece | Service | Configuration |
|---|---|---|
| Database | MongoDB Atlas | A replica set, so transactions work. |
| API | Render web service `memed-payouts-api` | Defined by [`render.yaml`](render.yaml): root `backend`, Node 22, build `npm ci --include=dev && npm run build`, start `npm start`, health check `/api/health`. `MONGODB_URI` and `JWT_SECRET` are set only in Render. `CORS_ORIGIN` allows `https://payout-tracker-ruddy.vercel.app`. No `REDIS_URL`, so the cache is off and `/api/health` reports `redis: disabled`. |
| Web | Vercel project, root directory `frontend` | `NEXT_PUBLIC_API_URL=https://memed-payouts-api.onrender.com/api` |

To reproduce it:

1. **Atlas:** create a cluster and a database user, allow network access from `0.0.0.0/0`, and copy the `mongodb+srv://…/memed` connection string.
2. **Render:** New → Blueprint → this repository. Render reads `render.yaml` and asks for `MONGODB_URI` and `CORS_ORIGIN`.
3. **Seed (optional):** from your machine, `cd backend && MONGODB_URI='<atlas uri>' JWT_SECRET=<any 32+ chars> npm run seed`.
4. **Vercel:** import the repository with root directory `frontend` and set `NEXT_PUBLIC_API_URL` to the Render URL plus `/api`.
5. **CORS:** set `CORS_ORIGIN` on Render to the Vercel URL and redeploy.

## Scaling

See [SCALING.md](SCALING.md) (half a page) for how this would handle 10,000 creators.

## Known limitations

- Post ownership is not verified, and view counts come from the simulation endpoint rather than the Instagram and YouTube APIs. On the live demo anyone can call it, as the brief specifies.
- The demo accounts are shared, so other visitors' campaigns and posts appear alongside yours.
- No password reset, refresh tokens, or campaign editing, pausing or budget top-ups.
- Lists are capped and paged in the browser rather than paginated by the API.
- The frontend has no automated tests; it is covered by lint, typecheck, build and scripted browser runs.

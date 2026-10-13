# Meme'd Campaign Payout Tracker: Implementation Plan

> **Source of truth:** `WLDD Assignment.md`. If this plan and the brief disagree, the brief wins.
> **Status:** plan only, with no application code yet. Last updated: 13-10-2026.
> **Conventions:** all money is in whole Indian rupees (INR) and stored as integers. Dates are shown as DD-MM-YYYY. The UI uses Indian digit grouping (₹1,00,000).

---

## 0. Prerequisites (verified 13-10-2026)

**Machine:** Ubuntu 24.04.4 LTS, kernel 7.0.0-38-generic, x86_64. The user is in the `docker` group, so Docker commands need no sudo.

| Tool | Required | Found | Status |
|---|---|---|---|
| Node.js | 22 LTS (the brief accepts ≥ 18) | v22.23.3 via nvm, installed 13-10-2026. The nvm default stays at v20.20.2. | OK. Run `nvm use 22` in this folder. |
| npm | ≥ 10 | 10.9.9 (bundled with Node 22) | OK |
| git | ≥ 2.30 | 2.43.0 | OK. The repo is initialised on `main` with no commits yet, and `.gitignore` is added. |
| Docker Engine | ≥ 24 | 29.1.3 | OK. The daemon is reachable without sudo. |
| Docker Compose | v2 | 2.40.3 | OK |
| mongosh | ≥ 2.0 | 2.8.3 | OK |
| MongoDB for local development | 7.0, run as a replica set | Docker `mongo:7` (7.0.43), pulled and tested | OK. A replica set `rs0` started and a transaction committed. |
| System `mongod` (systemd) | not used | 8.0.21 | **Broken on this kernel.** Do not use it (see below). |
| MongoDB for tests (mongodb-memory-server) | 10.x running MongoDB 7.0 | Default binary 7.0.24 | OK. A replica set started and a transaction committed. |
| Redis (bonus) | 7.x | Docker `redis:7-alpine` (7.4.11), pulled and tested | OK |
| `redis-cli` on the host | optional | not installed | Optional. Use `docker exec memed-redis redis-cli` instead. |
| MongoDB Atlas | reachable for production | SRV DNS lookups work, outbound TCP 27017 is open and `cloud.mongodb.com` responds | OK at the network level. Credentials can't be tested until the cluster exists. |
| npm registry, Docker Hub, fastdl.mongodb.org, Render, Vercel | reachable | all reachable | OK |

### MongoDB on this kernel
- MongoDB 8.0 and later refuse to start or crash on Linux kernel 6.19 and newer. The cause is an incompatibility between their bundled TCMalloc allocator and the kernel's rseq interface (MongoDB issue SERVER-121912). This machine runs kernel 7.0, so both the system `mongod` 8.0.21 and the `mongo:8` Docker image exit at startup. Docker containers share the host kernel, so changing the image does not help.
- MongoDB 7.0 uses an older allocator and works.
- **Local development:** use Docker `mongo:7` as a single-node replica set `rs0` on `127.0.0.1:27017`. Never use `mongo:8` or `mongo:latest` on this machine.
- **Tests:** pin mongodb-memory-server to MongoDB 7.0.24 by adding `"config": { "mongodbMemoryServer": { "version": "7.0.24" } }` to `backend/package.json`. This stops a library upgrade from silently switching the tests to 8.x.
- **Production:** Atlas runs on MongoDB's own servers and is not affected. Everything the app relies on (transactions, `$expr` and update pipelines) works the same on 7.0 and 8.x.

Until `docker-compose.yml` exists (Phase 14), start the development services with:
```bash
docker run -d --name memed-mongo -p 127.0.0.1:27017:27017 -v memed-mongo-data:/data/db mongo:7 --replSet rs0 --bind_ip_all
docker exec memed-mongo mongosh --quiet --eval 'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})'   # run once
docker run -d --name memed-redis -p 127.0.0.1:6379:6379 redis:7-alpine                                                 # optional, bonus only
```
Connect with `MONGODB_URI=mongodb://localhost:27017/memed?directConnection=true`.

### Atlas or local
Use the local Docker MongoDB for development and tests. It is faster, works offline and keeps test data out of the cloud database. Use Atlas only for the deployed app and for the one-off production seed (§12).

### Optional commands that need sudo
```bash
# The broken system mongod is enabled and fails on every boot. Disable it so it can never claim port 27017.
sudo systemctl disable --now mongod
# redis-cli on the host. Optional, because `docker exec memed-redis redis-cli` works without it.
sudo apt-get update && sudo apt-get install -y redis-tools
```

### Notes
- Node 20 reached end of life on 30-04-2026, so this project targets Node 22, the oldest release line still supported.
- Set your git author identity (`git config user.name` and `git config user.email`) before the first commit.

---

## 1. Project summary

Meme'd is a creator marketplace. **Brands** create campaigns on Instagram or YouTube. Each campaign has a **total budget** and a **milestone ladder** of view-threshold → payout pairs, for example 10k → ₹500, 50k → ₹2,000 and 100k → ₹5,000. **Creators** submit post links to live campaigns. View counts arrive through `PATCH /api/submissions/:id/views`, which simulates platform data and has no role check. Each update pays the creator up to the payout of the **highest milestone crossed**. Only the unpaid difference is ever paid, and a campaign's total payouts never exceed its budget.

**Deliverables:**
- A public GitHub repo with `/backend` and `/frontend`.
- A README with setup steps, environment variables and assumptions.
- `.env.example` files for both apps.
- A deployed live link.
- Jest unit tests for payout calculation and the budget cap.

**Optional work:**
- Bonus: a Redis cache for the campaign list and view-spike flagging.
- Stretch: concurrency safety and idempotency, Docker, and a scaling note for 10,000 creators.

**Evaluated on:** a working deployed build, correct payout and budget logic, code structure, use of TypeScript, async/await and error handling, the quality of the git commits, and a clear README with stated assumptions. In the follow-up call you must be able to explain every file and make a small change live.

---

## 2. Tech stack and versions

Major versions are targets. Each app's `package-lock.json` pins the exact versions at install time.

| Layer | Choice | Version | Notes |
|---|---|---|---|
| Runtime | Node.js | 22 LTS | Set `.nvmrc` to `22` and `engines.node` to `>=22` |
| Language | TypeScript | 5.x | Enable `strict` and `noUncheckedIndexedAccess` |
| HTTP | Express | 5.x | Rejected promises from async handlers reach the error middleware natively, so no `asyncHandler` wrapper is needed. Note that `req.query` is read-only in v5. |
| Database | MongoDB + Mongoose | MongoDB **7.0 locally** (8.x will not start on this machine; see §0). Atlas M0 runs 8.x. Mongoose 8.x. | Must run as a **replica set**, because transactions require one. Atlas is one by default. |
| Validation | Zod | 3.x | Validates request bodies, params and env |
| Auth | jsonwebtoken, bcryptjs | 9.x, 2.x | JWTs are signed with HS256 |
| Security | helmet, cors, express-rate-limit | latest | |
| Logging | pino + pino-http | latest | |
| Dev runner | tsx | latest | `tsx watch src/server.ts` |
| Frontend | Next.js (App Router) + React | 15.x + 19.x | Set `output: 'standalone'` for Docker |
| Styling | Tailwind CSS | 4.x | Kept minimal |
| Data fetching | SWR | 2.x | |
| Tests | Jest, ts-jest, supertest, mongodb-memory-server | 29.x, 29.x, 7.x, 10.x | `MongoMemoryReplSet` provides transactions in tests. Pin its MongoDB binary to 7.0.24 (§0). |
| Cache (bonus) | Redis + ioredis | 7.x + 5.x | Optional at runtime |
| Containers (stretch) | Docker and Compose v2 | — | Images: `node:22-alpine`, `mongo:7`, `redis:7-alpine` |
| Lint and format | ESLint (typescript-eslint) + Prettier | latest | |

---

## 3. Monorepo folder structure

The repo holds two independent npm packages, with no npm workspaces. Render and Vercel each deploy one subfolder as their root directory.

```
/
├── backend/
│   ├── src/
│   │   ├── server.ts                 # connect Mongo/Redis, listen on PORT, graceful shutdown (SIGTERM)
│   │   ├── app.ts                    # builds the Express app without listening; supertest imports this
│   │   ├── config/env.ts             # parses process.env with Zod; fails fast on bad config
│   │   ├── lib/
│   │   │   ├── db.ts                 # mongoose connect/disconnect
│   │   │   ├── redis.ts              # optional ioredis client (null when REDIS_URL is unset)
│   │   │   ├── logger.ts             # pino
│   │   │   └── errors.ts             # AppError(status, code, message, details?)
│   │   ├── middleware/
│   │   │   ├── auth.ts               # requireAuth (verify JWT → req.user), requireRole(...roles)
│   │   │   ├── validate.ts           # Zod validation of body/params/query → req.valid (never reassigns req.query)
│   │   │   ├── rate-limit.ts         # authLimiter, viewsLimiter (both disabled when NODE_ENV=test)
│   │   │   └── error-handler.ts      # maps AppError, ZodError, CastError and E11000 to the error envelope
│   │   ├── models/
│   │   │   ├── user.model.ts
│   │   │   ├── campaign.model.ts
│   │   │   └── submission.model.ts
│   │   ├── domain/                   # PURE functions with no I/O; target of the unit tests
│   │   │   ├── milestones.ts         # parseMilestoneLadder()
│   │   │   ├── payout.ts             # entitledPayout(), planPayout()
│   │   │   ├── post-url.ts           # canonicalPostKey()
│   │   │   └── spike.ts              # isViewSpike()
│   │   ├── modules/
│   │   │   ├── auth/                 # auth.routes.ts, auth.controller.ts, auth.service.ts, auth.schemas.ts
│   │   │   ├── campaigns/            # campaigns.routes|controller|service|schemas.ts, campaigns.cache.ts, campaigns.dto.ts
│   │   │   └── submissions/          # submissions.routes|controller|service|schemas.ts, views.service.ts, submissions.dto.ts
│   │   ├── types/express.d.ts        # types req.user = { id, role }
│   │   └── scripts/seed.ts           # creates a demo brand, creator, campaign and submissions
│   ├── tests/
│   │   ├── setup/mongo.ts            # MongoMemoryReplSet lifecycle helpers
│   │   ├── helpers/invariants.ts     # assertInvariants(campaignId), covering I1–I5 in §4
│   │   ├── unit/                     # payout, milestones, post-url and spike tests (*.test.ts)
│   │   └── integration/              # auth, campaigns, submissions, views and concurrency tests (*.test.ts)
│   ├── jest.config.ts
│   ├── tsconfig.json / tsconfig.build.json
│   ├── .env.example
│   ├── Dockerfile / .dockerignore
│   └── package.json                  # scripts: dev, build, start, test, test:unit, test:coverage, lint, typecheck, seed
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx            # AuthProvider + Navbar
│   │   │   ├── page.tsx              # redirects by role to /brand, /creator or /login
│   │   │   ├── login/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   ├── brand/layout.tsx      # <RequireRole role="brand">
│   │   │   ├── brand/page.tsx        # create campaign + my campaigns (spent vs remaining)
│   │   │   ├── brand/campaigns/[id]/page.tsx  # one campaign + its submissions
│   │   │   ├── creator/layout.tsx    # <RequireRole role="creator">
│   │   │   └── creator/page.tsx      # earnings, live campaigns, submit post, my submissions
│   │   ├── components/               # RequireRole, Navbar, CampaignForm (milestone row editor), BudgetBar,
│   │   │                             # CampaignCard, SubmitPostForm, SubmissionsTable, SimulateViewsForm, EarningsSummary
│   │   └── lib/
│   │       ├── api.ts                # fetch wrapper: base URL, Bearer header, ApiError(status, code, message)
│   │       ├── auth.tsx              # AuthProvider, useAuth()
│   │       ├── types.ts              # DTOs that mirror the backend (§5)
│   │       └── format.ts             # formatINR (en-IN), formatDate (DD-MM-YYYY), formatViews
│   ├── next.config.ts
│   ├── .env.example
│   ├── Dockerfile / .dockerignore
│   └── package.json                  # scripts: dev, build, start, lint, typecheck
├── docker-compose.yml                # mongo (rs0), redis, backend, frontend
├── render.yaml                       # Render blueprint (optional)
├── .github/workflows/ci.yml          # lint, typecheck and test (optional)
├── .gitignore  .editorconfig  .nvmrc
├── README.md
└── IMPLEMENTATION_PLAN.md
```

---

## 4. Data models

These conventions apply to all three models:
- Every model uses `timestamps: true`.
- A `toJSON` transform maps `_id` to `id` and strips `__v` and `passwordHash`.
- Controllers return DTOs built by mappers, never raw documents.

### User
| Field | Type | Rules |
|---|---|---|
| `name` | string | required, trimmed, 2–80 characters |
| `email` | string | required, unique, lowercased, trimmed, valid email |
| `passwordHash` | string | required, `select: false`, bcrypt |
| `role` | `'brand' \| 'creator'` | required, immutable |

Index: `{ email: 1 }`, unique.

### Campaign
| Field | Type | Rules |
|---|---|---|
| `brand` | ObjectId → User | required; this is the owner |
| `name` | string | required, 3–100 characters |
| `platform` | `'instagram' \| 'youtube'` | required |
| `totalBudget` | int | required, > 0, immutable |
| `spent` | int | default 0, ≥ 0. Only the payout service writes it. |
| `milestones` | `[{ views: int, payout: int }]` | stored sorted ascending by views, immutable after creation (see §7) |
| `status` | `'live' \| 'exhausted'` | default `'live'` |

`remaining` (`totalBudget − spent`) is derived in the DTO and never stored.
Indexes: `{ status: 1, createdAt: -1 }` and `{ brand: 1, createdAt: -1 }`.

### Submission
| Field | Type | Rules |
|---|---|---|
| `campaign` | ObjectId → Campaign | required |
| `creator` | ObjectId → User | required |
| `postUrl` | string | the URL exactly as the creator submitted it (trimmed) |
| `postKey` | string | canonical ID such as `instagram:C8xYz12AbC` or `youtube:dQw4w9WgXcQ`. **Unique.** |
| `views` | int | default 0, ≥ 0, never decreases |
| `entitledAmount` | int | the payout of the highest milestone crossed at the current `views` |
| `paidAmount` | int | default 0. The amount actually paid, never more than `entitledAmount`. |
| `flagged` | boolean | default false. Once set, it stays set. |
| `flagReason`, `flaggedAt` | string, Date | optional |
| `viewHistory` | `[{ views: int, at: Date, paid: int }]` | seeded with `{ views: 0, at: createdAt, paid: 0 }` and capped at the last 20 entries with `$push` + `$slice` |

`unpaidAmount` (`entitledAmount − paidAmount`) is derived in the DTO. It is the shortfall caused by budget exhaustion.
Indexes: `{ postKey: 1 }` (unique), `{ creator: 1, createdAt: -1 }` and `{ campaign: 1, createdAt: -1 }`.

### Invariants (asserted in tests)
- **I1:** `campaign.spent ≤ campaign.totalBudget`
- **I2:** `campaign.spent = Σ paidAmount` over the campaign's submissions
- **I3:** `0 ≤ paidAmount ≤ entitledAmount`
- **I4:** `views`, `entitledAmount`, `paidAmount` and `spent` never decrease
- **I5:** `status = 'exhausted'` if and only if `spent = totalBudget`

---

## 5. API contract

The base path is `/api`. Requests and responses are JSON, with a body limit of 10 kB. Authenticated routes take `Authorization: Bearer <jwt>`. The JWT payload is `{ sub: userId, role }`, and tokens expire after `JWT_EXPIRES_IN`.

**Error envelope** (every error response):
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Human-readable message", "details": [] } }
```

**Common errors** (these can occur on any route and are not repeated in the table below):

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | The Zod check failed |
| 400 | `INVALID_ID` | A path ID is not a valid ObjectId |
| 401 | `UNAUTHENTICATED` | The token is missing, invalid or expired (authenticated routes only) |
| 403 | `FORBIDDEN` | The user has the wrong role or does not own the resource |
| 429 | `RATE_LIMITED` | The rate limit was exceeded |
| 500 | `INTERNAL_ERROR` | An unexpected error occurred. Production responses never include a stack trace. |

**DTOs** (`frontend/src/lib/types.ts` mirrors these):
```ts
type Role = 'brand' | 'creator';
type Platform = 'instagram' | 'youtube';
interface Milestone { views: number; payout: number }
interface UserDTO { id: string; name: string; email: string; role: Role; createdAt: string }
interface CampaignDTO {
  id: string; brandId: string; name: string; platform: Platform;
  totalBudget: number; spent: number; remaining: number;
  milestones: Milestone[]; status: 'live' | 'exhausted'; createdAt: string;
}
interface SubmissionDTO {
  id: string; campaignId: string; campaign?: { id: string; name: string; platform: Platform };
  creatorId: string; creator?: { id: string; name: string };
  postUrl: string; views: number; entitledAmount: number; paidAmount: number; unpaidAmount: number;
  flagged: boolean; flagReason?: string; lastViewsAt: string; createdAt: string;
}
```

### Endpoints

| # | Method and path | Auth / role | Request | Success | Endpoint-specific errors |
|---|---|---|---|---|---|
| 1 | `GET /api/health` | public | — | `200 { status: 'ok', db: 'up', redis: 'up' \| 'down' \| 'disabled' }` | `503` when the DB is down |
| 2 | `POST /api/auth/signup` | public, rate-limited | `{ name, email, password (8–72 chars), role }` | `201 { token, user: UserDTO }` | `409 EMAIL_TAKEN` |
| 3 | `POST /api/auth/login` | public, rate-limited | `{ email, password }` | `200 { token, user: UserDTO }` | `401 INVALID_CREDENTIALS`, with the same message whether the email is unknown or the password is wrong |
| 4 | `GET /api/auth/me` | any role | — | `200 { user: UserDTO }` | — |
| 5 | `POST /api/campaigns` | **brand** | `{ name, platform, totalBudget, milestones: Milestone[] }` | `201 { campaign: CampaignDTO }`, with milestones sorted | `400 INVALID_MILESTONES` (`details` lists each rule broken; see §7) |
| 6 | `GET /api/campaigns` | any role | — | `200 { campaigns: CampaignDTO[] }`: live only, newest first, at most 100, Redis-cached | — |
| 7 | `GET /api/campaigns/mine` | **brand** | — | `200 { campaigns: (CampaignDTO & { submissionCount, flaggedCount })[] }` | — |
| 8 | `GET /api/campaigns/:id` | **brand**, owner only | — | `200 { campaign: CampaignDTO, submissions: SubmissionDTO[] }` | `404 CAMPAIGN_NOT_FOUND`, `403 FORBIDDEN` when the brand is not the owner |
| 9 | `POST /api/submissions` | **creator** | `{ campaignId, postUrl }` | `201 { submission: SubmissionDTO }` | `400 INVALID_POST_URL`, `400 PLATFORM_MISMATCH`, `404 CAMPAIGN_NOT_FOUND`, `409 CAMPAIGN_NOT_LIVE`, `409 DUPLICATE_SUBMISSION` |
| 10 | `GET /api/submissions/mine` | **creator** | — | `200 { summary: { totalEarned, totalEntitled, totalUnpaid, submissionCount }, submissions: SubmissionDTO[] }` | — |
| 11 | `PATCH /api/submissions/:id/views` | **none: no auth and no role check** (per the brief), rate-limited | `{ views: integer }` | `200 { submission, payout: { entitled, paidNow, paidTotal, unpaid }, campaign: { id, spent, remaining, status } }` | `404 SUBMISSION_NOT_FOUND`, `409 VIEWS_DECREASED` (`details: { currentViews }`), `409 CONCURRENT_UPDATE` (`details: { retryable: true }`) |

**Rules for endpoint 11:**
- `views` must be a JSON integer with 0 ≤ views ≤ `Number.MAX_SAFE_INTEGER`. Strings, floats and negative numbers return 400.
- If `views` equals the current count, the response is `200` with `paidNow: 0` and nothing is written. This makes the endpoint idempotent.
- If `views` is lower than the current count, the response is `409 VIEWS_DECREASED` and no state changes.

**Example request for endpoint 5.** The server sorts the ladder before saving.
```json
{ "name": "Diwali Drop", "platform": "instagram", "totalBudget": 6000,
  "milestones": [ { "views": 50000, "payout": 2000 }, { "views": 10000, "payout": 500 }, { "views": 100000, "payout": 5000 } ] }
```

---

## 6. Payout and budget rules

### 6.1 Definitions
- **Ladder `L`:** milestones sorted ascending by `views`, with payouts that strictly increase (`parseMilestoneLadder` enforces this; see §7).
- **Crossed:** a milestone `m` is crossed when `views ≥ m.views`. The threshold is inclusive.

### 6.2 `entitledPayout(L, views)`: the highest milestone crossed, not a cumulative sum
```
entitled = 0
for m in L (ascending by views):
  if views >= m.views: entitled = m.payout
  else: break
return entitled
```
Take the ladder [10k → ₹500, 50k → ₹2,000, 100k → ₹5,000] and a jump from 0 to 60k views. The result is **₹2,000**, not ₹2,500.

### 6.3 `planPayout({ entitled, alreadyPaid, totalBudget, spent })`: delta plus budget cap
```
delta     = max(0, entitled − alreadyPaid)     // only the difference is ever paid
remaining = max(0, totalBudget − spent)
grant     = min(delta, remaining)              // pay the partial remainder if the budget is short
unpaid    = entitled − (alreadyPaid + grant)   // shortfall; recorded, not owed later
exhausts  = (spent + grant) >= totalBudget
return { delta, grant, unpaid, exhausts }
```
This makes updates **idempotent**. Replaying the same entitlement gives `delta = 0`, so `grant = 0`. `paidAmount` only ever moves toward `entitled` and never past it.

### 6.4 `applyViewUpdate(submissionId, newViews, now)`: concurrency-safe orchestration (`views.service.ts`)
The code below is pseudocode.
```
assert newViews is a safe integer ≥ 0                                → 400 VALIDATION_ERROR
for attempt in 1..3:
  try:
    result = await mongoose.connection.transaction(async (session) => {
      sub = Submission.findById(id).session(session)                  → 404 SUBMISSION_NOT_FOUND
      if newViews < sub.views:  throw AppError(409, VIEWS_DECREASED)   // no write
      if newViews == sub.views: return noop(sub)                        // paidNow = 0, no write
      camp     = Campaign.findById(sub.campaign).session(session)
      entitled = entitledPayout(camp.milestones, newViews)
      plan     = planPayout({ entitled, alreadyPaid: sub.paidAmount, totalBudget: camp.totalBudget, spent: camp.spent })
      spike    = isViewSpike(last(sub.viewHistory), newViews, now)     // §10.2

      if plan.grant > 0:
        camp = Campaign.findOneAndUpdate(
          { _id: camp._id,
            $expr: { $lte: [ { $add: ['$spent', plan.grant] }, '$totalBudget' ] } },   // budget guard
          [ { $set: { spent: { $add: ['$spent', plan.grant] } } },                       // update pipeline: sets
            { $set: { status: { $cond: [ { $gte: ['$spent', '$totalBudget'] },           // spent and status in one
                                         'exhausted', '$status' ] } } } ],               // atomic write (I5)
          { new: true, session })
        if camp == null: throw StaleReadError

      res = Submission.updateOne(
        { _id: sub._id, views: sub.views, paidAmount: sub.paidAmount },      // optimistic guard against double-pay
        { $set:  { views: newViews, entitledAmount: entitled, ...(spike && !sub.flagged ? flagFields : {}) },
          $inc:  { paidAmount: plan.grant },
          $push: { viewHistory: { $each: [{ views: newViews, at: now, paid: plan.grant }], $slice: -20 } } },
        { session })
      if res.matchedCount == 0: throw StaleReadError                         // another update won, so abort

      return { sub, camp, paidNow: plan.grant, entitled, unpaid: plan.unpaid }
    })
    if result.camp.status changed to 'exhausted': invalidate the Redis live list   // runs after commit, never inside the txn
    return result
  catch StaleReadError: continue                                            // re-read fresh state and retry
throw AppError(409, CONCURRENT_UPDATE, { retryable: true })
```

**Why this is safe:**
- **The transaction** makes the campaign write and the submission write all-or-nothing, which upholds I2. When two transactions touch the same document, MongoDB raises a `WriteConflict`. The driver labels it `TransientTransactionError` and `connection.transaction()` retries automatically.
- **The `$expr` guard on `spent + grant ≤ totalBudget`** keeps I1 true at the document level, so overspending is impossible even if a read was stale.
- **The `views`/`paidAmount` guard** means two identical updates can never both pay the same delta. This makes the endpoint idempotent and prevents double-pay.
- **The update pipeline** sets `status` in the same write as `spent`, which upholds I5. If the installed Mongoose version needs an option to accept pipeline updates, enable it. The fallback is a second conditional `updateOne` inside the same transaction.
- **`StaleReadError`** is not a transient error, so the outer loop handles it with a bounded retry of three attempts.

### 6.5 View-count rules
- A **lower** view count returns `409 VIEWS_DECREASED` and changes nothing. Payouts are never clawed back.
- An **equal** view count is a no-op that returns 200 with `paidNow: 0`.
- A **higher** view count records the views and sets `entitledAmount`. It pays `grant`, which can be 0 when the budget is exhausted.

### 6.6 Worked example (this also serves as an integration test script)
Ladder: [10k → ₹500, 50k → ₹2,000, 100k → ₹5,000]. Budget: ₹6,000.

| Step | Update | Entitled | Delta | Remaining before | Paid now | Spent after | Notes |
|---|---|---|---|---|---|---|---|
| 1 | A: 0 → 60k | 2,000 | 2,000 | 6,000 | 2,000 | 2,000 | Crosses two milestones but pays the highest only |
| 2 | A: 60k → 60k | 2,000 | 0 | 4,000 | 0 | 2,000 | Idempotent no-op |
| 3 | A: 60k → 55k | — | — | — | — | 2,000 | `409 VIEWS_DECREASED` |
| 4 | B: 0 → 12k | 500 | 500 | 4,000 | 500 | 2,500 | |
| 5 | C: 0 → 120k | 5,000 | 5,000 | 3,500 | **3,500** | 6,000 | Partial remainder: C has ₹1,500 unpaid and the campaign becomes **exhausted** |
| 6 | B: 12k → 70k | 2,000 | 1,500 | 0 | 0 | 6,000 | Views are recorded and B has ₹1,500 unpaid |

At the end, spent is ₹6,000, which equals 2,000 + 500 + 3,500. This satisfies I1, I2 and I5.

---

## 7. Assumptions and edge cases (copy these into the README)

| # | Case | Decision |
|---|---|---|
| 1 | One update crosses two or more milestones | Pay only the payout of the highest milestone crossed, minus what has already been paid. The payout is never cumulative. |
| 2 | Views pass the top milestone | Entitlement stays at the top payout and nothing more is paid. |
| 3 | Views exactly equal a threshold | The milestone counts as crossed, because the comparison is `>=`. |
| 4 | The budget runs out mid-payout | Pay the partial remainder, set the campaign to `exhausted` and record the shortfall as `unpaidAmount` on the submission. The shortfall is shown, not owed. Budget top-ups are out of scope, but if one were added, the delta formula would settle shortfalls on the next view update. |
| 5 | Order of payouts | First come, first served by the order in which updates commit. There is no pro-rata split. |
| 6 | Exhausted campaign | It is hidden from the live list and new submissions are rejected with `409 CAMPAIGN_NOT_LIVE`. View updates are still recorded with `paidNow: 0`. |
| 7 | Lower view count | Rejected with `409 VIEWS_DECREASED`. There is no clawback. |
| 8 | Repeated or concurrent identical updates | Idempotent. The delta is paid exactly once (§6.4). |
| 9 | Duplicate submission | Each post is canonicalised to a `postKey` and the key is unique **globally**. A post can earn from only one campaign, and only the first claim succeeds (`409 DUPLICATE_SUBMISSION`). The unique index makes this safe under races. |
| 10 | Post ownership | Not verified, because that would need platform OAuth. This is noted as a known gap. |
| 11 | Post URL rules | **Instagram:** `instagram.com` with `/p/`, `/reel/`, `/reels/` or `/tv/` followed by a shortcode, giving `instagram:<code>`. Shortcodes are case-sensitive, so only the host is lowercased. **YouTube:** `youtube.com/watch?v=`, `/shorts/` or `youtu.be/` followed by an 11-character ID, giving `youtube:<id>`. The `www.` and `m.` prefixes, query strings, fragments and trailing slashes are ignored. A host that does not match the campaign's platform returns `400 PLATFORM_MISMATCH`. |
| 12 | Several posts by one creator in one campaign | Allowed. Each post is a separate submission with its own payout. |
| 13 | Invalid milestone ladder | Rejected with `400 INVALID_MILESTONES` in any of these cases: the ladder is empty; it has more than 10 rungs; a `views` or `payout` value is not a positive integer; two rungs share a threshold; the payouts do not strictly increase once sorted by views; or the top payout is greater than `totalBudget`. |
| 14 | Unsorted ladder | Accepted and sorted ascending by `views` before validating and saving. |
| 15 | Changes to a campaign | The ladder and budget cannot change after creation, because there is no edit endpoint. This protects entitlements that have already been earned. |
| 16 | Currency | Whole rupees stored as integers, with no paise. Integer budgets and payouts guarantee an integer remainder. |
| 17 | `PATCH …/views` security | Unauthenticated, as the brief specifies, and rate-limited. In production it would be a signed webhook or a worker holding a service token. |
| 18 | Spike flag | Informational only: payouts still go through and the brand sees a badge. In production, flagged payouts would be held for review. |
| 19 | Roles | Each account has exactly one role, set at signup and immutable. Brands see only their own campaigns' submissions, and creators see only their own submissions. |
| 20 | Campaign lifecycle | A campaign is `live` until its budget is exhausted. Start and end dates are not part of the brief. |

---

## 8. Frontend pages and auth flow

| Route | Access | Contents |
|---|---|---|
| `/` | any | Redirects to `/brand`, `/creator` or `/login` depending on the user's auth state and role |
| `/login`, `/signup` | anonymous (redirects if already logged in) | Email and password form; the signup form adds a role selector (brand or creator). Shows server error messages. |
| `/brand` | brand | **Create campaign** form: name, platform, budget and a milestone row editor where rows can be added or removed. Client-side checks mirror §7 #13. **My campaigns** list: status badge, a `BudgetBar` showing spent vs remaining in ₹, the submission count and the flagged count. |
| `/brand/campaigns/[id]` | brand (owner) | Campaign summary plus a submissions table with creator, post link, views, entitled, paid, unpaid and flag columns |
| `/creator` | creator | **Earnings summary** (total earned, unpaid and number of posts). **Live campaigns**, where each card shows the platform, ladder, remaining budget and a submit-post form. **My submissions** table, where each row has a **"Simulate platform views"** input that calls `PATCH /api/submissions/:id/views` for the demo. |

**Auth flow:**
1. **Token storage:** the JWT is kept in `localStorage` under `memed.token` and sent in the `Authorization: Bearer` header. The frontend (vercel.app) and the API (onrender.com) are on different sites, so httpOnly cookies would need `SameSite=None` third-party cookies, which browsers increasingly block. A Bearer header also avoids CSRF.
   - **Trade-off:** the token is exposed if the page has an XSS flaw.
   - **Mitigations:** the code never uses `dangerouslySetInnerHTML`, tokens expire after 1 day and the API sends helmet headers.
   - **In production:** a backend-for-frontend with a same-site cookie.
2. **Boot:** `AuthProvider` reads the token and calls `GET /auth/me`. Its status moves from `loading` to either `authenticated` or `anonymous`. An invalid token is cleared.
3. **Login and signup:** the response's token is stored, then the app calls `router.replace` to `/brand` or `/creator` based on the role.
4. **Route guards:** `brand/layout.tsx` and `creator/layout.tsx` wrap their pages in `<RequireRole role="…">`.
   - While the status is `loading`, the guard shows a skeleton.
   - An anonymous user is sent to `/login?next=<path>`.
   - A user with the wrong role is sent to their own dashboard.
   - The guards are for user experience only. The API enforces every role check.
5. **API wrapper:** any 401 response triggers logout and a redirect to `/login`. Errors display `error.message` from the error envelope. After a mutation, the app calls SWR's `mutate()` on the affected keys.
6. **Formatting:** amounts use `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })` and dates use DD-MM-YYYY. The first request shows a "waking the server…" hint if it takes more than 5 seconds, because the free Render instance spins down when idle.

---

## 9. Testing plan

Tests run on Jest + ts-jest. Integration tests use supertest against `app.ts`, with a `MongoMemoryReplSet` holding a single node (`storageEngine: 'wiredTiger'`) so that transactions work.

The scripts are `npm test` (all tests, run in band, 30 s timeout), `npm run test:unit` and `npm run test:coverage`. The coverage target is 100 % of lines in `src/domain/`.

### 9.1 Unit tests: payout calculation (`payout.test.ts`)
`entitledPayout` with the ladder [10k → 500, 50k → 2,000, 100k → 5,000]:

| Views | Expected | Why |
|---|---|---|
| 0 | 0 | No milestone is crossed |
| 9,999 | 0 | Just below the first threshold |
| 10,000 | 500 | The threshold is inclusive |
| 49,999 | 500 | Between two milestones |
| 60,000 | 2,000 | Two milestones crossed in one jump: the highest is paid, not 2,500 |
| 1,000,000 | 5,000 | Capped at the top milestone |
| any views, empty ladder | 0 | Defensive case |

### 9.2 Unit tests: budget cap (`planPayout`)

| Case | Input (entitled, paid, budget, spent) | Expected |
|---|---|---|
| First payout | 500, 0, 6,000, 0 | grant 500, unpaid 0 |
| Incremental | 2,000, 500, 6,000, 500 | grant 1,500 |
| Idempotent replay | 2,000, 2,000, 6,000, 2,000 | grant 0 |
| Partial remainder | 5,000, 0, 6,000, 2,500 | grant 3,500, unpaid 1,500, exhausts true |
| Exact fit | 1,000, 0, 3,000, 2,000 | grant 1,000, unpaid 0, exhausts true |
| Already exhausted | 2,000, 500, 6,000, 6,000 | grant 0, unpaid 1,500 |
| Corrupt state (paid > entitled) | 500, 2,000, 6,000, 2,000 | grant 0, never negative |
| **Property test** | 1,000 seeded random sequences of rising views across 1–20 submissions | In every sequence, Σ grant ≤ budget and paid ≤ entitled |

### 9.3 Other unit tests
- **`milestones.test.ts`:** unsorted input is sorted. Each rejection rule in §7 #13 has its own test.
- **`post-url.test.ts`:** each Instagram and YouTube URL variant maps to the same key. A wrong platform returns `PLATFORM_MISMATCH`. Profile URLs and garbage input return `INVALID_POST_URL`.
- **`spike.test.ts`:** covers the threshold examples in §10.2.

### 9.4 Integration tests
- **`auth.test.ts`:** signup, duplicate email, wrong password, an expired or garbage token, and role guards (a creator cannot create a campaign and a brand cannot submit).
- **`campaigns.test.ts`:** creation with validation errors, the live list hides exhausted campaigns, `/mine` and owner-only detail.
- **`submissions.test.ts`:** a duplicate `postKey` across creators, platform mismatch and submitting to an exhausted campaign.
- **`views.test.ts`:** replays the worked example in §6.6 step by step and asserts every column, plus the 400, 404 and 409 cases.

### 9.5 Concurrency tests (`concurrency.test.ts`)
`assertInvariants()` checks I1–I5 after every scenario.
1. **Many submissions, one budget:** budget ₹5,000, ladder [10k → ₹2,000] and 5 submissions. Fire 5 PATCH requests with `views=10000` through `Promise.all`. Expect the paid amounts to be {2,000, 2,000, 1,000, 0, 0} in any order, `spent` = 5,000 and the campaign exhausted.
2. **One submission hammered:** fire 20 parallel PATCH requests with `views=60000`. Expect Σ `paidNow` = 2,000, `paidAmount` = 2,000, `spent` = 2,000 and exactly one history entry for 60k.
3. **Out-of-order increases:** send 15k, 60k and 120k for the same submission in parallel. Some may return `409 VIEWS_DECREASED`. The final state must match whichever update had the highest count: `paidAmount` equals the entitlement at the final `views`, within the budget.
4. **Service-level race:** call `applyViewUpdate` directly with `Promise.all`, bypassing HTTP, and assert the same results.

Frontend has no unit tests in scope. CI runs `lint`, `typecheck` and `build` for it.

---

## 10. Bonus and stretch scope

### 10.1 Redis cache for the campaign list (bonus)
- **Pattern:** cache-aside on `GET /api/campaigns` under the key `campaigns:live:v1`, holding the JSON array of DTOs with a TTL of `CAMPAIGN_CACHE_TTL_SECONDS` (default 30).
- **Invalidation:** the key is deleted (`DEL`) when a campaign is created and when a payout commit changes a campaign's status to `exhausted`. The remaining budget shown in the list may be up to 30 s stale. This trade-off is documented. Submissions always re-check the status from MongoDB.
- **Graceful degradation:** if `REDIS_URL` is unset, the cache is disabled. If Redis is down, cache errors are logged as warnings and the handler falls through to MongoDB. The client uses `lazyConnect` and `maxRetriesPerRequest: 1`, and `/api/health` reports the cache state.
- Redis is not deployed. It runs locally and in docker-compose. Upstash's free tier is an option if needed.

### 10.2 View-spike flagging (bonus)
The flag compares each update against the previous reading (`prev` = the last `viewHistory` entry):
```
gained  = newViews − prev.views
minutes = max((now − prev.at) / 60000, 1)          // floor of 1 minute avoids dividing by tiny intervals
spike   = gained >= SPIKE_MIN_GAIN && gained / minutes >= SPIKE_VIEWS_PER_MIN
```
- **Defaults:** `SPIKE_MIN_GAIN = 10000` and `SPIKE_VIEWS_PER_MIN = 1000`. In plain terms, a submission is flagged when it gains at least 10,000 views at more than 1,000 views a minute since the last reading.
- **Examples:**
  - +15,000 views in 5 minutes (3,000 a minute) is flagged.
  - +15,000 views over 2 hours (125 a minute) is not flagged.
  - +5,000 views in 10 seconds is not flagged, because the gain is below the minimum.
- **On a spike:** the service sets `flagged = true`, `flagReason` (for example, "+15,000 views in 5 min") and `flaggedAt`. The flag stays set and is informational (§7 #18).

### 10.3 Concurrency and idempotency (stretch)
This is implemented by §6.4 and tested by §9.5.

### 10.4 Docker (stretch)
- **`backend/Dockerfile`** is a multi-stage build:
  1. Install dependencies with `npm ci`.
  2. Build with `tsc`.
  3. Runtime stage on `node:22-alpine` with `NODE_ENV=production`, dependencies installed with `npm ci --omit=dev`, `dist/` copied in, running as `USER node` on port 4000 with `CMD ["node","dist/server.js"]`.
- **`frontend/Dockerfile`** builds Next.js in standalone mode. It takes the build arg `NEXT_PUBLIC_API_URL`, which is baked in at build time. The runtime stage copies `.next/standalone`, `.next/static` and `public`, then runs `node server.js` on port 3000.
- **`docker-compose.yml`** defines four services:
  - **`mongo`** (`mongo:7`, never 8.x on this machine; see §0) starts with `--replSet rs0 --bind_ip_all`. Its healthcheck runs `rs.initiate({_id:'rs0',members:[{_id:0,host:'mongo:27017'}]})` if the replica set is not yet initialised. Data lives in a named volume.
  - **`redis`** (`redis:7-alpine`).
  - **`backend`** uses `MONGODB_URI=mongodb://mongo:27017/memed?replicaSet=rs0` and `REDIS_URL=redis://redis:6379`, and waits for the mongo healthcheck to pass (`depends_on` with `condition: service_healthy`).
  - **`frontend`** is built with `NEXT_PUBLIC_API_URL=http://localhost:4000/api`, because the browser calls the API through the host's port.
- One command starts everything: `docker compose up --build`.

### 10.5 Scaling to 10,000 creators (README section, half a page at most; outline)
- **The real load:** about 10,000 creators with roughly 3 active posts each is about 30,000 submissions. Polling every 15 minutes gives about 35 view updates per second, which MongoDB handles easily. The hard parts are hot-document contention and platform API quotas, not raw volume.
- **Ingestion:** replace the public PATCH endpoint with a sync worker, for example BullMQ on Redis. It polls the Instagram and YouTube APIs in batches within their quotas and enqueues view updates, and the API returns 202.
- **Hot campaigns:** a viral campaign with thousands of submissions turns `campaign.spent` into a write hotspot, and transactions start conflicting and retrying. To fix this, partition the queue by `campaignId` so that one consumer processes each campaign's payouts in sequence. Different campaigns still run in parallel.
- **Ledger:** add an append-only `payouts` collection with a unique key on (`submissionId`, `milestone`) for audit and reconciliation. Real money transfers would go out through an outbox pattern to a payment provider, and `paidAmount` would become a value derived from the ledger.
- **Reads:** use cursor pagination on every list, cache campaign lists and per-creator earnings in Redis, and serve dashboards from read replicas.
- **Fraud:** move spike detection to asynchronous scoring and hold payouts on flagged submissions until they are reviewed.
- **Operations:** run stateless API instances behind a load balancer, with structured logs and metrics such as p95 latency, the transaction retry rate and budget-exhaustion events, plus alerting. Shard by `campaignId` only if growth demands it, which is unlikely at this scale.

---

## 11. Environment variables (these become the `.env.example` files)

### `backend/.env.example`
| Variable | Required | Default / example | Purpose |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `development`, `test` or `production` |
| `PORT` | no | `4000` | Render injects its own value |
| `MONGODB_URI` | **yes** | `mongodb://localhost:27017/memed?directConnection=true` | **Must point to a replica set**, either Atlas or compose `rs0`. On the host, use `directConnection=true`. |
| `JWT_SECRET` | **yes** | `change-me-to-a-32+-char-random-string` | Validated to be at least 32 characters |
| `JWT_EXPIRES_IN` | no | `1d` | |
| `BCRYPT_ROUNDS` | no | `10` | |
| `CORS_ORIGIN` | **yes** | `http://localhost:3000` | Comma-separated allowlist |
| `REDIS_URL` | no | *(empty)* | Leaving it empty disables the cache |
| `CAMPAIGN_CACHE_TTL_SECONDS` | no | `30` | |
| `SPIKE_MIN_GAIN` | no | `10000` | §10.2 |
| `SPIKE_VIEWS_PER_MIN` | no | `1000` | §10.2 |
| `LOG_LEVEL` | no | `info` | pino log level |

### `frontend/.env.example`
| Variable | Required | Example | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | **yes** | `http://localhost:4000/api` | API base URL. Next.js bakes it in at build time, so the app must be rebuilt after a change. |

Comments go on their own lines in the `.env.example` files, not inline. `.env` files are gitignored, and the ignore rule allows `.env.example` through.

---

## 12. Deployment plan

1. **MongoDB Atlas (M0, free)**
   - Create the cluster on AWS `ap-southeast-1` (Singapore) so it sits next to the Render server.
   - Create a database user with `readWrite` on the `memed` database and a long random password.
   - Network Access: allow `0.0.0.0/0`, because Render's free tier has no static outbound IPs. Document this trade-off.
   - URI: `mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/memed?retryWrites=true&w=majority`. M0 is a replica set, so transactions work.
2. **Render (backend web service, free)**
   - Set the repo's root directory to `backend`, runtime Node and region Singapore.
   - Build command: `npm ci --include=dev && npm run build`. The `--include=dev` flag keeps `typescript` installed even when `NODE_ENV=production`.
   - Start command: `npm start`, which runs `node dist/server.js`. The server listens on `process.env.PORT` and calls `app.set('trust proxy', 1)` so the rate limiter sees real client IPs.
   - Health check path: `/api/health`.
   - Environment variables: everything in §11 except `REDIS_URL`. Turn on auto-deploy from `main`. Optionally codify all of this in `render.yaml`.
   - **Cold starts:** the free instance spins down after about 15 minutes idle, and the first request then takes 30–60 s. Note this in the README.
3. **Seed:** run `npm run seed` locally with `MONGODB_URI` set to the Atlas URI, because Render's free tier has no shell. Publish the demo brand and creator credentials in the README.
4. **Vercel (frontend)**
   - Import the repo with root directory `frontend`. The Next.js framework preset is detected automatically.
   - Set `NEXT_PUBLIC_API_URL=https://<service>.onrender.com/api` and deploy.
5. **Wire CORS:** set `CORS_ORIGIN` on Render to the Vercel production URL and redeploy.
6. **Smoke test the live site:**
   1. Sign up as a brand and create a campaign.
   2. Sign up as a creator, submit a post and simulate views (or `curl` the PATCH endpoint).
   3. Check that the brand dashboard shows the right spent and remaining amounts and that the creator dashboard shows the right earnings.
   4. Exhaust the budget and confirm the campaign disappears from the live list.
7. **README:** add the live frontend and API URLs, the demo credentials and the cold-start note. Make sure the repo is **public**.

> Deploy the backend early, right after Phase 6, to surface Atlas and Render issues while there is still time to fix them.

---

## 13. Phase-wise build checklist

Phases 0–11 and 16–18 are the must-haves. Bonus and stretch work (Phases 7, 12–15) comes after the core is deployable. Use one commit per phase, or split a phase into more commits of the same type if it grows.

**Phase 0: Repo setup**
- [x] Initialise git and add `.gitignore` covering Node, Next.js, env files and coverage (done 13-10-2026; see §0).
- [x] Add `.editorconfig` and `.nvmrc` (22), plus a shared `.prettierrc.json`.
- [x] Create the `backend/` and `frontend/` folders and a README stub.
- Commit: `chore: initialise monorepo with backend and frontend folders`

**Phase 1: Backend foundation**
- [x] Set up `package.json`, the strict `tsconfig`, ESLint and Prettier, `tsx`, and the Jest config.
- [x] Add `config/env.ts` (Zod), `lib/logger.ts`, `lib/db.ts` and `lib/errors.ts`.
- [x] Build `app.ts` (helmet, cors allowlist, `express.json({ limit: '10kb' })`, pino-http, routes, 404 handler, error handler). Build `server.ts` with graceful shutdown.
- [x] Add `GET /api/health` and `backend/.env.example`.
- Commit: `feat(backend): bootstrap express app with env validation, db connection and error handling`

**Phase 2: Auth**
- [x] Add the User model, bcrypt hashing, the Zod schemas and the signup, login and me routes.
- [x] Add `requireAuth`, `requireRole`, `express.d.ts` and `authLimiter`.
- [x] Write the integration tests in `auth.test.ts`.
- Commit: `feat(auth): add jwt signup and login with brand and creator roles`

**Phase 3: Payout domain (pure functions) + unit tests**
- [ ] Write `domain/milestones.ts` (`parseMilestoneLadder`) and `domain/payout.ts` (`entitledPayout`, `planPayout`).
- [ ] Cover every case in §9.1–9.3 for milestones and payouts, including the property test. Reach 100 % line coverage of `domain/`.
- Commit: `feat(payouts): add milestone ladder validation and budget-capped payout calculation`

**Phase 4: Campaigns API**
- [ ] Add the Campaign model, its indexes and the DTO mapper with derived `remaining`.
- [ ] Add `POST /campaigns`, `GET /campaigns`, `GET /campaigns/mine` and `GET /campaigns/:id` (owner only).
- [ ] Write `campaigns.test.ts`.
- Commit: `feat(campaigns): add campaign creation, live listing and brand budget overview`

**Phase 5: Submissions API**
- [ ] Write `domain/post-url.ts` (`canonicalPostKey`) and its unit tests.
- [ ] Add the Submission model, the unique `postKey` index and the seeded `viewHistory`.
- [ ] Add `POST /submissions`, with the live check, platform match, and E11000 mapped to 409. Add `GET /submissions/mine` with its summary.
- [ ] Write `submissions.test.ts`.
- Commit: `feat(submissions): add post submission with url canonicalisation and duplicate checks`

**Phase 6: View updates and payouts**
- [ ] Write `views.service.ts` (`applyViewUpdate`) exactly as in §6.4: transaction, `$expr` guard, optimistic submission guard and bounded retry.
- [ ] Add `PATCH /submissions/:id/views` with no auth and with `viewsLimiter`.
- [ ] Write `views.test.ts`, which replays the worked example in §6.6.
- Commit: `feat(payouts): pay milestone deltas on view updates with atomic budget guard`

**Phase 7: Concurrency proof (stretch)**
- [ ] Write `tests/helpers/invariants.ts` and `concurrency.test.ts` covering the scenarios in §9.5.
- Commit: `test(payouts): prove no overspend or double-pay under concurrent view updates`

**Phase 8: Seed data**
- [ ] Write `scripts/seed.ts`, which creates a demo brand and creator, two campaigns and a few submissions. It must be safe to rerun: it upserts by email and `postKey`.
- Commit: `chore(backend): add seed script for demo accounts and campaigns`

**Phase 9: Frontend foundation and auth**
- [ ] Scaffold Next.js with TypeScript, the App Router and Tailwind. Add `lib/api.ts`, `lib/types.ts` and `lib/format.ts`.
- [ ] Add `AuthProvider`, `RequireRole`, the login and signup pages, the role redirect on `/`, and the Navbar with logout.
- [ ] Add `frontend/.env.example`.
- Commit: `feat(frontend): add auth flow with jwt storage and role-based route guards`

**Phase 10: Brand dashboard**
- [ ] Build `CampaignForm` with the milestone row editor and client-side checks, the `BudgetBar`, the my-campaigns list and the campaign detail page with its submissions table.
- Commit: `feat(frontend): add brand dashboard for campaign creation and budget tracking`

**Phase 11: Creator dashboard**
- [ ] Build `EarningsSummary`, the live campaign cards, `SubmitPostForm`, the my-submissions table and `SimulateViewsForm`. Refresh the data with SWR's `mutate()`.
- Commit: `feat(frontend): add creator dashboard to browse campaigns, submit posts and track earnings`

**Phase 12: Redis cache (bonus)**
- [ ] Write `lib/redis.ts` and `campaigns.cache.ts` with cache-aside reads, invalidation on create and on exhaustion, and graceful fallback. Report the cache state in `/api/health`.
- Commit: `feat(campaigns): cache live campaign list in redis with graceful fallback`

**Phase 13: Spike flagging (bonus)**
- [ ] Write `domain/spike.ts` and its unit tests. Call it from `applyViewUpdate` and show the flag badge in both dashboards.
- Commit: `feat(submissions): flag submissions with unusually fast view spikes`

**Phase 14: Docker (stretch)**
- [ ] Write both Dockerfiles, both `.dockerignore` files and `docker-compose.yml` with a single-node `rs0` replica set and Redis. Check that `docker compose up --build` runs end to end.
- Commit: `build: dockerise backend and frontend with docker-compose`

**Phase 15: CI (optional)**
- [ ] Write `.github/workflows/ci.yml`. It runs lint, typecheck and test for the backend, and lint, typecheck and build for the frontend, on every push and pull request.
- Commit: `ci: run lint, typecheck and tests on push`

**Phase 16: Deployment**
- [ ] Complete §12 steps 1–6 (Atlas, Render, seed, Vercel, CORS and the smoke test). Add `render.yaml` if you use it.
- Commit: `chore(deploy): add render blueprint and production configuration`

**Phase 17: Documentation**
- [ ] Write the README: overview, live links, demo credentials, local setup (both with and without Docker), environment variable tables, the API summary, payout rules with the worked example, the assumptions from §7, the testing commands, the scaling note from §10.5 and known gaps.
- Commit: `docs: add readme with setup, assumptions, payout rules and scaling note`

**Phase 18: Final QA**
- [ ] All tests pass. Lint and typecheck are clean. No `.env` file is committed. The repo is public. The live smoke test passes.
- [ ] Rehearse the walkthrough: you can explain §6.4 line by line and make a small live change, such as adding a ladder rule.
- Commit (only if something needed fixing): `fix(<scope>): <what was fixed>`

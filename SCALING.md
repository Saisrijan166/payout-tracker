# Scaling to 10,000 creators

**The real load is modest.** Assume 10,000 creators with about three active posts each: roughly 30,000 submissions. Refreshing every post's views every 15 minutes is about 33 view updates per second on average. A single MongoDB replica set handles that comfortably. The hard parts are elsewhere: write contention on popular campaigns, platform API quotas, and keeping money movements auditable.

**Ingest views with a worker, not a public endpoint.** Replace `PATCH /views` with a sync worker (for example BullMQ on Redis) that polls the Instagram and YouTube APIs in batches within their quotas, backs off on rate limits, and enqueues one job per changed count. Jobs are idempotent because payouts are computed from the count, not from increments.

**Remove the hot-document bottleneck.** Every payout in a campaign updates the same campaign document. A viral campaign with thousands of posts would make concurrent transactions conflict and retry. Partitioning the queue by `campaignId` gives each campaign a single consumer, so its payouts are applied one at a time with no conflicts, while different campaigns still run in parallel. The database guards stay as a safety net.

**Keep a payout ledger.** Add an append-only `payouts` collection with one entry per paid delta, keyed uniquely by submission and milestone. `paidAmount` and `spent` become totals that can be rebuilt and reconciled from it. Real money transfers go out through an outbox to a payment provider, so a crash can never pay twice or lose a payment.

**Serve reads cheaply.** Use cursor pagination on every list; the API currently caps lists instead. Cache campaign lists and per-creator earnings in Redis, and serve brand dashboards from secondary reads. The existing indexes cover the main queries (`status + createdAt`, `brand`, `creator`, `campaign`, unique `postKey`).

**Treat fraud as a pipeline.** Move spike detection to asynchronous scoring, using signals such as growth curves and account history, and hold payouts on flagged posts until they are reviewed.

**Operate it.** The API is stateless, so it scales horizontally behind a load balancer. Track p95 latency, the transaction retry rate, queue lag and budget-exhaustion events, and alert on them. Sharding by `campaignId` is an option for far larger growth; it is not needed at this size.

# Scaling to 10,000 creators

**The load is modest.** 10,000 creators with about three live posts each is roughly 30,000 submissions. Refreshing every post's views every 15 minutes is about 33 updates a second, which one MongoDB replica set handles easily. The hard parts are contention, platform quotas and auditability.

- **Ingest with a worker.** Replace the public `PATCH /views` with a queue worker (for example BullMQ) that polls the Instagram and YouTube APIs in batches within their quotas. Jobs stay idempotent because payouts are computed from the view count, not from increments.
- **Remove the hot document.** Every payout in a campaign updates that campaign's `spent`, so a viral campaign makes concurrent transactions conflict and retry. Partitioning the queue by `campaignId` applies each campaign's payouts one at a time while different campaigns run in parallel; the database guards remain as a safety net.
- **Keep a ledger.** An append-only `payouts` collection, unique per submission and milestone, lets `paidAmount` and `spent` be rebuilt and reconciled. Real transfers go out through an outbox, so a crash can never pay twice or lose a payment.
- **Serve reads cheaply.** Cursor pagination on every list (the API currently caps lists), Redis caching for campaign lists and earnings, and secondary reads for dashboards.
- **Treat fraud as a pipeline.** Score spikes asynchronously and hold flagged payouts until reviewed.
- **Operate it.** The API is stateless, so it scales horizontally. Track p95 latency, transaction retries, queue lag and budget exhaustion. Sharding by `campaignId` is only needed far beyond this size.

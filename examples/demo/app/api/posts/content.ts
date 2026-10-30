export type Post = { slug: string; title: string; description: string; published: string; markdown: string };

// Trusted, authored CMS content. User-supplied Markdown would need HTML sanitization.
export const posts: Post[] = [
  {
    slug: "reliable-webhooks",
    title: "A practical guide to reliable webhooks",
    description: "Design delivery, signatures, retries and recovery for integrations that survive real failures.",
    published: "2026-10-12T09:00:00.000Z",
    markdown: `# A practical guide to reliable webhooks

Webhooks connect a billing system to an application without making either side poll for changes. The happy path is short: receive an event, update a record and return a successful response. The difficult work starts when the database is unavailable, a customer changes their endpoint, or a network timeout hides whether the request arrived.

This guide describes the delivery contract used by a small subscription service. The examples use invoices, but the same decisions apply to shipping updates, document processing and account provisioning. Our goal is **eventual delivery with visible failures**, rather than a promise of exactly-once execution that the network cannot keep.

## Define the event contract first

An event should identify a fact that has already happened. Prefer \`invoice.paid\` to \`update.invoice\`: a consumer should not have to fetch a mutable resource to learn what happened at the time of payment. Include an immutable event ID, a schema version, a timestamp and the minimum data needed by the consumer.

\`\`\`json
{
  "id": "evt_invoice_1042",
  "type": "invoice.paid",
  "version": 1,
  "created": "2026-10-12T08:30:00.000Z",
  "data": {
    "invoiceId": "inv_1042",
    "customerId": "cus_108",
    "amountCents": 12900,
    "currency": "EUR"
  }
}
\`\`\`

Keep money in integer minor units and document the currency. A consumer should never infer euros from the sender's location. Timestamps should include their timezone, and identifiers should be treated as opaque strings. Once an event is published, changes to its meaning require a new version.

### Separate events from delivery attempts

One event can have many delivery attempts and several destinations. Store the event once, then create an independent delivery row for each subscribed endpoint. This avoids copying large payloads into every retry record and lets support answer two different questions: *what happened?* and *where did we send it?*

| Record | Stable identity | Changes during retries |
| --- | --- | --- |
| Event | Event ID | Nothing in the original payload |
| Subscription | Endpoint ID | URL, enabled state, signing key |
| Delivery | Event ID + endpoint ID | Attempt count, next attempt, result |
| Attempt | Unique attempt ID | Completion time and response summary |

Retain enough history to investigate failures without storing sensitive payloads forever. For our invoice events, delivery metadata is kept for thirty days and full payloads for seven. Access to either record is audited.

## Accept quickly, process durably

The receiver's HTTP handler should validate the request, persist it and acknowledge receipt. It should not call three external services before returning. A short handler reduces the chance that a successful business operation looks like a timeout to the sender.

1. Read the original request bytes with a bounded body size.
2. Verify the signature and timestamp.
3. Insert the event into a durable inbox with a unique constraint on its ID.
4. Return a successful response after the transaction commits.
5. Let a worker process the inbox and record its outcome.

> A successful HTTP response means the receiver has taken responsibility for the event. It does not need to mean every downstream side effect is complete.

The inbox and application update can share a database transaction. If an update succeeds but marking the inbox row complete fails, the transaction rolls back both writes. When a side effect is external, pass an idempotency key to that service and record the result before acknowledging the job.

\`\`\`sql
CREATE TABLE webhook_inbox (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL,
  processed_at timestamptz
);
\`\`\`

Do not use a cache entry as the only deduplication record. A cache eviction would allow a duplicate event to charge a card or create a second shipment. The retention period for deduplication must cover the sender's documented retry and replay window.

## Verify signatures over the original bytes

A signature protects the payload from modification and authenticates the sender. It does not encrypt the data. Use HTTPS for transport and a separate signing secret for each endpoint. Compute the signature over a timestamp and the exact request bytes, before parsing JSON.

Re-serializing a parsed object changes whitespace, key ordering or number formatting. The resulting bytes may describe the same object but have a different signature. Compare signatures with a constant-time primitive supplied by the cryptography library, and reject timestamps outside a narrow tolerance.

### Rotate secrets without an outage

During rotation, the sender can attach signatures made with both the current and previous keys. The receiver accepts either for a documented overlap period. Log the key identifier that verified the request, without logging the secret or the complete signature.

- Generate secrets with a cryptographically secure random source.
- Store them in a secret manager, separate from delivery payloads.
- Scope a secret to one endpoint and environment.
- Remove the previous key after the overlap window closes.
- Exercise rotation in staging before the first production incident.

Signature checks should run before expensive parsing or business logic. Rate limits and request size limits still matter: authentication alone does not stop an authenticated sender from delivering an unexpectedly large payload.

## Retry with a budget

A timeout is ambiguous. The receiver might have committed the event just before the connection closed. Retrying is correct only when the receiving side is idempotent. Use exponential backoff with jitter so that recovering infrastructure does not face a synchronized wave of requests.

| Attempt | Example delay | Purpose |
| --- | --- | --- |
| 1 | Immediate | Normal delivery |
| 2 | About 30 seconds | Brief connection failure |
| 3 | About 2 minutes | Short service restart |
| 4 | About 10 minutes | Deployment rollback |
| 5 | About 1 hour | Longer incident |
| Final | Within 24 hours | Escalate to an operator |

Honor a reasonable \`Retry-After\` value for rate limits. Retry connection failures, timeouts, HTTP 429 and server errors. Most other client errors need configuration changes rather than immediate repetition. Disable an endpoint only according to a published policy, and tell its owner why delivery stopped.

Avoid retrying inside a database transaction. Long network calls hold locks and connections while providing no stronger delivery guarantee. Claim a delivery row, release the transaction, perform the request, then write the attempt result in a new transaction.

## Plan for out-of-order events

An invoice can be paid and refunded before the first webhook has been delivered. Separate delivery queues and network delays mean the consumer may observe the refund first. Timestamps alone are insufficient for ordering: different machines can have different clocks.

For resources that require ordered updates, include a monotonically increasing resource version. Apply only versions newer than the stored version. For notifications about independent facts, process every unique event and derive the current state separately. Document which interpretation applies to each event type.

A consumer can fetch the current resource when it needs to recover from a version gap. That fetch should be a recovery mechanism, not a hidden requirement for every delivery. The event must still contain enough context to be useful during an upstream outage.

## Make operations visible

The delivery dashboard should show the event type, endpoint, attempt count, response status and next scheduled retry. Include a request ID that links to application logs. A response excerpt can help diagnose configuration errors, but truncate it and remove credentials before storage.

Useful metrics include queue age, successful delivery ratio, retries per event and endpoints that have exhausted their retry budget. A single global success percentage hides a customer whose endpoint has failed for hours. Alert on sustained queue age and repeated failures for an individual destination.

### Support safe replay

A replay is a new delivery attempt of the original event, using the same event ID and payload. Do not invent a fresh event ID to bypass deduplication. Operators should choose a bounded time range, inspect the affected endpoints and see a preview of the number of deliveries before starting.

- [x] Keep the original event ID on every retry.
- [x] Record who requested a manual replay.
- [x] Apply normal rate limits during recovery.
- [ ] Add a customer-visible replay audit page.

## Test the failures you expect

A useful integration test sends the same event twice, interrupts a response after the receiver commits, and delivers two versions in reverse order. Test invalid signatures, expired timestamps, a rotated key and payloads containing non-ASCII text such as café or München. Byte handling problems often hide behind ASCII-only fixtures.

Run a recovery exercise with a receiver that is offline for an hour. Confirm that the retry queue grows within its storage budget, other endpoints continue receiving events, and the recovered endpoint drains at an acceptable rate. No latency benchmark can replace this check of the delivery contract.

The final design is deliberately modest: durable events, independent deliveries, bounded retries and idempotent receivers. These parts make failures observable and recoverable without requiring either application to be continuously available.

See the [HTTP semantics reference](https://www.rfc-editor.org/rfc/rfc9110) for status-code behavior and the [security checklist](/docs/webhook-security) before enabling a production endpoint.
`,
  },
  {
    slug: "catalog-search",
    title: "Designing useful product search",
    description: "A small catalog needs clear ranking, stable identifiers and useful empty states.",
    published: "2026-10-19T09:00:00.000Z",
    markdown: `# Designing useful product search

A product catalog often fits comfortably in memory. For a shop with a few thousand products, an embedded full-text index can provide useful results without an external search cluster. The important questions are about relevance and operations: what gets indexed, when it changes, and how a user understands the result.

## Index the words customers use

Product titles deserve more weight than long descriptions. A search for **desk lamp** should favor a lamp whose title contains both words over a desk whose care instructions mention a lamp. Include category names and common terminology in descriptions, but avoid filling every record with unrelated keywords.

\`\`\`ts
const fields = ["title", "description", "category"];
const boost = { title: 3, category: 2 };
\`\`\`

Prefix matching helps while a customer is typing. Fuzzy matching can rescue a misspelling, but an aggressive edit distance makes short queries noisy. Set limits for query length and result count, and measure relevance with a small collection of real queries before changing defaults.

## Keep identifiers stable

A SKU should identify the same item across indexing, checkout and stock updates. Display names can change; identifiers should not. Store only the fields required by the result card in the index, then fetch authoritative pricing and availability before accepting an order.

| Field | Search use | Checkout use |
| --- | --- | --- |
| Title | Ranked text and result label | Human-readable description |
| Category | Filter and ranking boost | Tax and fulfillment rules |
| Price | Display snapshot | Revalidate before purchase |
| Stock | Availability hint | Reserve atomically |

An in-memory index is a snapshot. Rebuild it after a catalog update or replace it atomically with a new version. Mutating a live index incrementally is possible, but failed updates need a recovery path and concurrent requests need a clear consistency model.

## Treat empty results as a product decision

Return a successful empty result for an ordinary query with no matches. Reserve client errors for malformed parameters. Show the original query, offer a spelling suggestion when confidence is high, and keep category navigation available.

- Preserve the query when the customer changes a filter.
- Show a bounded number of results with an explicit total.
- Use a stable tie-breaker when relevance scores are equal.
- Keep raw relevance scores internal unless an API consumer needs them.

## Know when to move beyond an embedded index

A larger catalog, multilingual analysis, frequent writes or complex faceting may justify a separate service. Track index size and startup behavior before that move. A local index still needs an update strategy and monitoring; fewer moving parts do not remove the need for operational care.

The demonstration catalog uses generated, repeatable merchandising data. It exercises indexing and query handling, while relevance decisions for a real store should be evaluated against that store's actual products and customer searches.
`,
  },
];

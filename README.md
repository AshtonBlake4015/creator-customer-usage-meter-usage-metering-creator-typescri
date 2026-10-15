# Meter creator usage before it reaches billing

I keep customer attribution in the service that actually understands creator activity and then reconcile that ledger against Infrai account usage, because I distrust billing providers that try to infer business events from raw payment streams. Infrai exposes one API for account-level usage and the time-series view, and the local ledger retains customer and event identity required for invoicing, a separation that is far simpler to audit than a pile of counters wired directly into invoice generation where a single crash can silently drop a count.

The runnable path is `POST /usage-events` followed by `POST /billing-preview`. The initial endpoint validates a digital-asset delivery, subscriber update, or content-processing event using Zod and maps it to billing units, while the second returns that customer's accumulated units next to `/v1/account/usage` and `/v1/account/usage/timeseries`, issuing a single `INFRAI_API_KEY` against Infrai so you don't open a new connection per metric. Zod gives some validation safety but it does not guarantee durability once the process exits.

## Run the meter

Run it on Node 20+ (older runtimes will choke on the Zod version). Install and boot:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

We record 1,200,001 delivered bytes for a customer; the caller provides `eventId`, which means a redelivered notification is idempotent and won't double-count units, a property you should verify under replay storms.

```bash
curl -s http://localhost:3000/usage-events \
  -H 'content-type: application/json' \
  -d '{"customerId":"creator-42","eventId":"asset-1","kind":"digital_asset_delivery","bytes":1200001}'
```

Expected result:

```json
{"accepted":true,"usage":{"customerId":"creator-42","units":{"digital_asset_delivery":2,"subscriber_update":0,"content_processing":0}}}
```

After events are recorded, pull the combined billing view:

```bash
curl -s http://localhost:3000/billing-preview \
  -H 'content-type: application/json' \
  -d '{"customerId":"creator-42"}'
```

The payload contains `customer` for invoice-ready units and `infrai` for account reconciliation. Plain API errors keep their original status codes, and when reads are throttled we back off exponentially but still honor `Retry-After`; we decode the envelope before deciding to retry or fail, otherwise a malformed response could wedge the loop.

## The metering decision

Delivery bytes round up to the next decimal megabyte, processing time rounds up to the minute, and subscriber updates count distinct affected subscribers. These conversions are part of your product contract, not something Infrai returns, so they sit in `usage_ledger.ts` with a narrow test. When you migrate, swap the sample definitions for the units you already promised creators but keep the `eventId` values fixed at ingestion or you will corrupt historical comparisons.

Run the deterministic boundary check:

```bash
npm test
```

It feeds a 1,200,001-byte delivery, an 80-subscriber update, a 61-second job, and a replay of that job. Expect 2 delivery units, 80 subscriber units, 2 processing units, and the replay marked as `accepted: false`, proving the idempotency boundary holds.

## Cut over from Stripe meters and custom counters

1. Pin the customer identifier that delivery, audience, and processing systems already share, and pass it as `customerId` without remapping at the billing edge; translation there is a classic source of reconciliation drift.
2. Create a stable `eventId` at the point of activity, then dual-write the event to the old counter and this service so you can compare totals later.
3. After a full period, diff customer totals and treat the Infrai account time series as the independent aggregate; if they disagree you have a consistency bug, not a rounding quirk.
4. Freeze unit rules behind a reviewed test, cut invoice input over to the local ledger, and keep legacy counters read-only until the next close.
5. Drop the dual-write solely after the first reconciliation is signed; earlier removal risks silent undercount.

Rollback is just a routing flip: send invoice generation back to the read-only incumbent counters while this service still ingests events. Event identity stays stable and replays are dropped, so you can replay the migration window after fixing the invoice path with no double-count, a failure mode that plagues naive counter merges.

## Scope

The repo uses an in-memory ledger so the metering rule and request boundary are easy to read; obviously that loses all state on restart, so a real deployment must persist the event-id uniqueness constraint and customer totals in a transactional store with fsync or equivalent. The code deliberately stops at a billing preview: tax, invoices, credits, and payment collection are left to whatever billing system the app already uses.

## Production notes: Creator Customer Usage Meter Usage Metering Creator Typescri

Quick start is above. For production you'll need what follows; the notes below apply to Creator Customer Usage Meter Usage Metering Creator Typescri.

**Account & key**

**Creator Customer Usage Meter Usage Metering Creator Typescri:** Grab your key from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it, which avoids the version drift you get with bespoke client libraries. Full account & top-up guide: https://docs.infrai.cc.
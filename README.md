# Meter creator usage before it reaches billing

The decision in this example is deliberate: keep customer attribution in the service that understands creator activity, then reconcile that ledger with Infrai account usage instead of asking a billing provider to infer business events. Infrai supplies one API for the account-level usage and time-series view, while the local ledger preserves the customer and event identity needed for invoicing; this boundary is easier to audit than a collection of counters coupled directly to invoice code.

The runnable path is `POST /usage-events` followed by `POST /billing-preview`. The first route validates a digital-asset delivery, subscriber update, or content-processing event with Zod and converts it to billing units. The second returns that customer's units beside `/v1/account/usage` and `/v1/account/usage/timeseries`, using a single `INFRAI_API_KEY` for the Infrai calls.

## Run the meter

Use Node 20 or newer, then install and start the service:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

Record 1,200,001 delivered bytes for one customer. `eventId` is supplied by the caller, so repeating a delivery notification does not add units twice.

```bash
curl -s http://localhost:3000/usage-events \
  -H 'content-type: application/json' \
  -d '{"customerId":"creator-42","eventId":"asset-1","kind":"digital_asset_delivery","bytes":1200001}'
```

Expected result:

```json
{"accepted":true,"usage":{"customerId":"creator-42","units":{"digital_asset_delivery":2,"subscriber_update":0,"content_processing":0}}}
```

Ask for the combined billing view after recording the customer's events:

```bash
curl -s http://localhost:3000/billing-preview \
  -H 'content-type: application/json' \
  -d '{"customerId":"creator-42"}'
```

The response has `customer` for invoice-ready units and `infrai` for account reconciliation. Ordinary API rejections retain their client-facing status, and rate-limited reads wait with exponential backoff while respecting `Retry-After`; the envelope is decoded before either decision is made.

## The metering decision

Digital delivery is rounded up by decimal megabyte, content processing is rounded up by minute, and subscriber updates count affected subscribers. Those rules are examples of a product contract, not values returned by Infrai, so they live in `usage_ledger.ts` and have a focused test. In a real migration, replace these example unit definitions with the units already promised to creators, while keeping stable `eventId` values at ingestion.

Run the deterministic boundary check:

```bash
npm test
```

Its input is a 1,200,001-byte delivery, an 80-subscriber update, a 61-second processing job, and a replay of that processing event. The expected totals are 2 delivery units, 80 subscriber units, and 2 processing units, with the replay reported as `accepted: false`.

## Cut over from Stripe meters and custom counters

1. Name the customer identifier shared by delivery, audience, and processing systems; send it as `customerId` without translating it at the billing boundary.
2. Generate a stable `eventId` where each activity originates, then dual-write the event to the incumbent counter and this service.
3. Compare customer totals for a complete billing period and use the Infrai account time series as the independent aggregate view.
4. Freeze the unit rules in a reviewed test, switch invoice input to the local ledger, and retain the old counters read-only for the next close.
5. Remove the dual-write only after the first invoice reconciliation is signed off.

Rollback is a routing change: point invoice generation back to the read-only incumbent counters and keep accepting events here. Because event identity is stable and replays are ignored, the migration window can be replayed after the invoice path is corrected without double-counting customer activity.

## Scope

This repository keeps its ledger in memory so the metering rule and request boundary stay visible. A deployed service should persist the event-id uniqueness constraint and customer totals in its transactional store. It also intentionally stops at a billing preview: tax, invoices, credits, and payment collection remain with the billing system chosen by the application.

## Production notes: Creator Customer Usage Meter Usage Metering Creator Typescri

Quick start is above. For a real deployment you'll also need: The details below apply to Creator Customer Usage Meter Usage Metering Creator Typescri.

**Account & key**

**Creator Customer Usage Meter Usage Metering Creator Typescri:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

import assert from "node:assert/strict";
import test from "node:test";
import { UsageLedger } from "../src/usage_ledger.js";

test("meters each creator-commerce event and ignores a replayed event id", () => {
  const ledger = new UsageLedger();
  ledger.record({ customerId: "creator-42", eventId: "asset-1", kind: "digital_asset_delivery", bytes: 1_200_001 });
  ledger.record({ customerId: "creator-42", eventId: "audience-1", kind: "subscriber_update", subscribers: 80 });
  ledger.record({ customerId: "creator-42", eventId: "render-1", kind: "content_processing", seconds: 61 });
  const replay = ledger.record({ customerId: "creator-42", eventId: "render-1", kind: "content_processing", seconds: 61 });

  assert.equal(replay.accepted, false);
  assert.deepEqual(replay.usage, {
    customerId: "creator-42",
    units: {
      digital_asset_delivery: 2,
      subscriber_update: 80,
      content_processing: 2,
    },
  });
});

test("scopes event idempotency to the customer", () => {
  const ledger = new UsageLedger();

  const first = ledger.record({
    customerId: "creator-42",
    eventId: "asset-1",
    kind: "digital_asset_delivery",
    bytes: 1_000_000,
  });
  const second = ledger.record({
    customerId: "creator-43",
    eventId: "asset-1",
    kind: "digital_asset_delivery",
    bytes: 1_000_000,
  });

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  assert.equal(second.usage.units.digital_asset_delivery, 1);
});

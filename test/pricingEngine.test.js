import test from "node:test";
import assert from "node:assert/strict";
import { quoteStay } from "../src/pricingEngine.js";

test("charges more for long daytime + late pickup than short overnight", () => {
  const shortOvernight = quoteStay({
    dropoff: new Date("2026-05-01T22:00:00"),
    pickup: new Date("2026-05-02T09:00:00"),
    baseline: 40,
    constantCompany: false
  });

  const longDay = quoteStay({
    dropoff: new Date("2026-05-01T08:00:00"),
    pickup: new Date("2026-05-02T22:00:00"),
    baseline: 40,
    constantCompany: false
  });

  assert.ok(longDay.total > shortOvernight.total);
});

test("applies constant company per started 24h block", () => {
  const q = quoteStay({
    dropoff: new Date("2026-05-01T08:00:00"),
    pickup: new Date("2026-05-02T09:00:00"),
    baseline: 35,
    constantCompany: true
  });
  assert.equal(q.surcharges.constantCompanyFee, 10);
});

test("applies early dropoff surcharge", () => {
  const q = quoteStay({
    dropoff: new Date("2026-05-01T06:30:00"),
    pickup: new Date("2026-05-01T12:30:00"),
    baseline: 40,
    constantCompany: false
  });
  assert.equal(q.surcharges.early, 5);
});

test("applies pre-05:00 early surcharge as overnight", () => {
  const q = quoteStay({
    dropoff: new Date("2026-05-01T04:30:00"),
    pickup: new Date("2026-05-01T12:30:00"),
    baseline: 40,
    constantCompany: false
  });
  assert.equal(q.surcharges.early, 30);
});

test("applies late drop-off surcharge tiers", () => {
  const q20 = quoteStay({
    dropoff: new Date("2026-05-01T20:15:00"),
    pickup: new Date("2026-05-02T08:15:00"),
    baseline: 40,
    constantCompany: false
  });
  assert.equal(q20.surcharges.lateDropoff, 3);

  const q21 = quoteStay({
    dropoff: new Date("2026-05-01T21:15:00"),
    pickup: new Date("2026-05-02T08:15:00"),
    baseline: 40,
    constantCompany: false
  });
  assert.equal(q21.surcharges.lateDropoff, 5);

  const q22 = quoteStay({
    dropoff: new Date("2026-05-01T22:15:00"),
    pickup: new Date("2026-05-02T08:15:00"),
    baseline: 40,
    constantCompany: false
  });
  assert.equal(q22.surcharges.lateDropoff, 10);
});

test("does not allow standalone extension in daytime window", () => {
  const q = quoteStay({
    dropoff: new Date("2026-04-18T08:30:00"),
    pickup: new Date("2026-04-18T20:00:00"),
    baseline: 40,
    constantCompany: false
  });
  assert.equal(q.plan.items[0].type, "daycare12");
});

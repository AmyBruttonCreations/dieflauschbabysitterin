import test from "node:test";
import assert from "node:assert/strict";
import { buildQuoteBreakdown, normalizeQuoteLanguage } from "../src/quoteMessages.js";

test("normalizeQuoteLanguage", () => {
  assert.equal(normalizeQuoteLanguage("de"), "de");
  assert.equal(normalizeQuoteLanguage("DE"), "de");
  assert.equal(normalizeQuoteLanguage(""), "en");
});

test("buildQuoteBreakdown in German", () => {
  const text = buildQuoteBreakdown({
    lang: "de",
    greetingName: "Saskia",
    petLabel: "Snoepje",
    petCodeword: "snoepje",
    dropoff: new Date("2026-07-09T15:00:00"),
    pickup: new Date("2026-07-12T22:00:00"),
    quote: {
      plan: { items: [{ type: "full24", start: new Date(), end: new Date(), cost: 30 }] },
      surcharges: {
        early: 0,
        lateDropoff: 0,
        seasonal: 0,
        constantCompanyFee: 0,
        medicalNeedsFee: 0,
        medicalNeedsRatePerDay: 5,
        medicalNeedsCalendarDays: 0
      },
      total: 30
    },
    baseline: 30,
    customer: { petCodeword: "snoepje" },
    medicalNeeds: false,
    isAdmin: false,
    lastMinuteSurcharge: 0,
    knownProfile: true,
    ownerName: "Saskia",
    fmtDate: (d) => d.toISOString()
  });
  assert.match(text, /Hallo Saskia/);
  assert.match(text, /Abgabe:/);
  assert.match(text, /Gesamt:/);
});

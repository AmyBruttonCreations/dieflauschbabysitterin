import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatPawPointsDisplay,
  fullRewardsUnlockedCount,
  pawPointsFromBookingTotal,
  pawPointsRemainingUntilNextReward,
  PAWS_PER_REWARD,
  progressTowardNextReward
} from "../src/pawPoints.js";

describe("pawPointsFromBookingTotal", () => {
  it("divides by 10", () => {
    assert.equal(pawPointsFromBookingTotal(35), 3.5);
    assert.equal(pawPointsFromBookingTotal(40), 4);
    assert.equal(pawPointsFromBookingTotal(45), 4.5);
  });
});

describe("progress and remainder", () => {
  it("progress toward first reward", () => {
    assert.ok(Math.abs(progressTowardNextReward(42.5) - 0.425) < 1e-9);
    assert.ok(Math.abs(pawPointsRemainingUntilNextReward(42.5) - 57.5) < 1e-9);
  });

  it("at threshold", () => {
    assert.equal(progressTowardNextReward(PAWS_PER_REWARD), 1);
    assert.equal(pawPointsRemainingUntilNextReward(PAWS_PER_REWARD), 0);
    assert.equal(fullRewardsUnlockedCount(PAWS_PER_REWARD), 1);
  });

  it("rollover toward second reward", () => {
    assert.ok(Math.abs(progressTowardNextReward(142.5) - 0.425) < 1e-9);
    assert.ok(Math.abs(pawPointsRemainingUntilNextReward(142.5) - 57.5) < 1e-9);
    assert.equal(fullRewardsUnlockedCount(142.5), 1);
    assert.equal(fullRewardsUnlockedCount(200), 2);
  });
});

describe("formatPawPointsDisplay", () => {
  it("trims trailing zeros", () => {
    assert.equal(formatPawPointsDisplay(42.5), "42.5");
    assert.equal(formatPawPointsDisplay(4), "4");
  });
});

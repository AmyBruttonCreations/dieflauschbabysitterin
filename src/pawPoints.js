/** Paw Points: 1 point per €10 invoice amount (marked paid on a stay, or manual ledger lines). */

export const PAWS_PER_REWARD = 100;

export function pawPointsFromBookingTotal(bookingTotal) {
  const t = Number(bookingTotal);
  if (!Number.isFinite(t) || t <= 0) return 0;
  return t / 10;
}

/** Progress 0–1 toward the *next* reward (uses remainder after full rewards). */
export function progressTowardNextReward(totalPawPoints) {
  const t = Math.max(0, Number(totalPawPoints) || 0);
  const remainder = t % PAWS_PER_REWARD;
  const denom = remainder === 0 && t >= PAWS_PER_REWARD ? PAWS_PER_REWARD : PAWS_PER_REWARD;
  const numer = remainder === 0 && t >= PAWS_PER_REWARD ? PAWS_PER_REWARD : remainder;
  return Math.min(1, numer / denom);
}

/** Paw Points still needed until the next reward unlock (0 if already past a boundary). */
export function pawPointsRemainingUntilNextReward(totalPawPoints) {
  const t = Math.max(0, Number(totalPawPoints) || 0);
  const remainder = t % PAWS_PER_REWARD;
  if (remainder === 0 && t >= PAWS_PER_REWARD) return 0;
  return remainder === 0 ? PAWS_PER_REWARD : PAWS_PER_REWARD - remainder;
}

export function fullRewardsUnlockedCount(totalPawPoints) {
  const t = Math.max(0, Number(totalPawPoints) || 0);
  return Math.floor(t / PAWS_PER_REWARD);
}

export function hasAtLeastOneRewardAvailable(totalPawPoints) {
  return fullRewardsUnlockedCount(totalPawPoints) >= 1;
}

/** Friendly display: trim trailing zeros, keep meaningful decimals. */
export function formatPawPointsDisplay(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  const s = n.toFixed(4).replace(/\.?0+$/, "");
  return s === "" ? "0" : s;
}

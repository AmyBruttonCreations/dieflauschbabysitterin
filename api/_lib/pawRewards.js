export const PAWS_PER_REWARD = 100;

/** API reward keys sent from the client. */
export function pawCostForRewardType(rewardType) {
  const t = String(rewardType || "");
  if (t === "portrait50" || t === "free1day") return PAWS_PER_REWARD;
  if (t === "free2days") return PAWS_PER_REWARD;
  return null;
}

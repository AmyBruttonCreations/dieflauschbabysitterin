import { normalizeCodeword, sql } from "../_lib/db.js";
import { methodNotAllowed, parseJsonBody, sendJson } from "../_lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  try {
    const body = await parseJsonBody(req);
    const codeword = normalizeCodeword(body.petCodeword || body.codeword);
    const rewardType = String(body.rewardType || "");
    if (!codeword || !rewardType) {
      return sendJson(res, 400, { ok: false, error: "petCodeword and rewardType are required." });
    }
    const needed = rewardType === "portrait50" ? 500 : 600;
    const db = sql();
    const [reward] = await db`SELECT points FROM rewards WHERE pet_codeword = ${codeword} LIMIT 1`;
    const points = Number(reward?.points || 0);
    if (points < needed) {
      return sendJson(res, 200, { ok: false, needed, points });
    }

    await db`UPDATE rewards SET points = points - ${needed} WHERE pet_codeword = ${codeword}`;
    await db`
      INSERT INTO reward_redemptions (pet_codeword, reward_type, cost)
      VALUES (${codeword}, ${rewardType}, ${needed})
    `;
    const [updated] = await db`SELECT points FROM rewards WHERE pet_codeword = ${codeword} LIMIT 1`;
    return sendJson(res, 200, { ok: true, points: Number(updated?.points || 0) });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message });
  }
}

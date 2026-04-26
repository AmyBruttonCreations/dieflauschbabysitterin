import { getAccountSnapshot } from "../_lib/account.js";
import { normalizeCodeword } from "../_lib/db.js";
import { methodNotAllowed, sendJson } from "../_lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const codeword = normalizeCodeword(req.query.codeword);
  if (!codeword) return sendJson(res, 400, { ok: false, error: "Missing codeword query param." });

  try {
    const snapshot = await getAccountSnapshot(codeword);
    return sendJson(res, 200, { ok: true, snapshot });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message });
  }
}

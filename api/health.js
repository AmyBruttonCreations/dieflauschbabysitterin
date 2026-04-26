import { sql } from "./_lib/db.js";
import { methodNotAllowed, sendJson } from "./_lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  try {
    await sql()`SELECT 1`;
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message });
  }
}

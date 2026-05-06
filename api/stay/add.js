import { normalizeCodeword, sql, toIsoStringOrNull } from "../_lib/db.js";
import { methodNotAllowed, parseJsonBody, sendJson } from "../_lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  try {
    const body = await parseJsonBody(req);
    const codeword = normalizeCodeword(body.petCodeword || body.codeword);
    const start = toIsoStringOrNull(body.start);
    const end = toIsoStringOrNull(body.end);
    if (!codeword || !start || !end) {
      return sendJson(res, 400, { ok: false, error: "petCodeword, start, and end are required." });
    }

    const stayId = String(body.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const status = String(body.status || "planned");
    const notes = String(body.notes || "");
    const inserted = await sql()`
      INSERT INTO stays (id, pet_codeword, start_at, end_at, status, notes)
      VALUES (${stayId}, ${codeword}, ${start}, ${end}, ${status}, ${notes})
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
    const created = inserted.length > 0;

    return sendJson(res, 200, { ok: true, id: stayId, created });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message });
  }
}

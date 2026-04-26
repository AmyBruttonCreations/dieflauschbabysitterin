import { normalizeCodeword, sql, toFiniteNumber } from "../_lib/db.js";
import { methodNotAllowed, parseJsonBody, sendJson } from "../_lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  try {
    const body = await parseJsonBody(req);
    const codeword = normalizeCodeword(body.petCodeword || body.codeword);
    if (!codeword) return sendJson(res, 400, { ok: false, error: "petCodeword is required." });

    const invoiceAmount = toFiniteNumber(body.invoiceAmount, Number.NaN);
    const paidAmount = toFiniteNumber(body.paidAmount, Number.NaN);
    if (!Number.isFinite(invoiceAmount) || !Number.isFinite(paidAmount)) {
      return sendJson(res, 400, { ok: false, error: "invoiceAmount and paidAmount must be numeric." });
    }

    const db = sql();
    const delta = paidAmount - invoiceAmount;

    await db`
      INSERT INTO ledger_entries (pet_codeword, invoice_amount, paid_amount, delta)
      VALUES (${codeword}, ${invoiceAmount}, ${paidAmount}, ${delta})
    `;

    const pointsIncrease = Math.floor(invoiceAmount);
    await db`
      INSERT INTO rewards (pet_codeword, points)
      VALUES (${codeword}, ${pointsIncrease})
      ON CONFLICT (pet_codeword)
      DO UPDATE SET points = rewards.points + EXCLUDED.points
    `;

    return sendJson(res, 200, { ok: true, delta });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message });
  }
}

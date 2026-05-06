import { normalizeCodeword, sql, toFiniteNumber } from "../_lib/db.js";
import { incrementPawsFromInvoice } from "../_lib/incrementPawsFromInvoice.js";
import { methodNotAllowed, parseJsonBody, sendJson } from "../_lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  try {
    const body = await parseJsonBody(req);
    const codeword = normalizeCodeword(body.petCodeword || body.codeword);
    const stayId = body.stayId != null && String(body.stayId).trim() ? String(body.stayId).trim() : null;
    const invoiceAmount = toFiniteNumber(body.invoiceAmount, Number.NaN);
    const paidAmount = toFiniteNumber(body.paidAmount, Number.NaN);

    if (!codeword || !stayId) {
      return sendJson(res, 400, { ok: false, error: "petCodeword and stayId are required." });
    }
    if (!Number.isFinite(invoiceAmount) || !Number.isFinite(paidAmount)) {
      return sendJson(res, 400, { ok: false, error: "invoiceAmount and paidAmount must be numeric." });
    }

    const db = sql();
    const [stayRow] = await db`
      SELECT id, paid_at FROM stays WHERE id = ${stayId} AND pet_codeword = ${codeword} LIMIT 1
    `;
    if (!stayRow) {
      return sendJson(res, 400, { ok: false, error: "Stay not found for this pet." });
    }
    if (stayRow.paid_at != null) {
      return sendJson(res, 400, { ok: false, error: "This stay is already marked paid (Paw Points already counted)." });
    }

    await db`
      UPDATE stays
      SET invoice_amount = ${invoiceAmount},
          paid_amount = ${paidAmount},
          paid_at = now()
      WHERE id = ${stayId} AND pet_codeword = ${codeword}
    `;

    await incrementPawsFromInvoice(db, codeword, invoiceAmount);

    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message });
  }
}

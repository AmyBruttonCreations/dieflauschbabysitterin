import { rowVal } from "./petsRow.js";

/**
 * JSON array in DB column `customer_names` (TEXT). Falls back to `customer_name` (joined) for old rows.
 * Accepts snake_case or camelCase row keys (some Neon/Node paths differ).
 */
export function customerNamesFromRow(row) {
  if (!row) return [];
  const arrDirect = rowVal(row, "customerNames", "customer_names");
  if (Array.isArray(arrDirect) && arrDirect.length) {
    return arrDirect.map((s) => String(s).trim()).filter(Boolean);
  }
  const rawStr = arrDirect;
  if (rawStr != null && rawStr !== "") {
    try {
      const parsed = typeof rawStr === "string" ? JSON.parse(rawStr) : rawStr;
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map((s) => String(s).trim()).filter(Boolean);
      }
    } catch {
      // fall through
    }
  }
  const c = String(rowVal(row, "customer_name", "customerName") ?? "").trim();
  return c ? [c] : [];
}

export function customerNamesFromRequestBody(body) {
  if (Array.isArray(body?.customerNames)) {
    const n = body.customerNames.map((s) => String(s ?? "").trim()).filter(Boolean);
    if (n.length) return n;
  }
  const one = String(body?.customerName ?? "").trim();
  return one ? [one] : [];
}

export function joinedFromNames(names) {
  return (names && names.length ? names : []).join(" & ");
}

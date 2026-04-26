/**
 * JSON array in DB column `customer_names` (TEXT). Falls back to `customer_name` (joined) for old rows.
 */
export function customerNamesFromRow(row) {
  if (!row) return [];
  if (row.customer_names != null && row.customer_names !== "") {
    try {
      const raw = row.customer_names;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map((s) => String(s).trim()).filter(Boolean);
      }
    } catch {
      // fall through
    }
  }
  const c = String(row?.customer_name ?? row?.customerName ?? "").trim();
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

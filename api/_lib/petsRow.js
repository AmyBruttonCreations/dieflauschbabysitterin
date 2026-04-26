/**
 * Some drivers or layers return Postgres columns as snake_case, others as camelCase.
 * Resolves a value from a pets row for either naming style.
 */
export function rowVal(row, ...candidates) {
  if (!row) return undefined;
  for (const k of candidates) {
    if (k != null && Object.prototype.hasOwnProperty.call(row, k) && row[k] !== undefined) {
      return row[k];
    }
  }
  return undefined;
}

export function boolFromRow(v) {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  if (typeof v === "string") {
    const s = v.toLowerCase();
    if (s === "t" || s === "true" || s === "1" || s === "yes") return true;
    if (s === "f" || s === "false" || s === "0" || s === "no" || s === "") return false;
  }
  return Boolean(v);
}

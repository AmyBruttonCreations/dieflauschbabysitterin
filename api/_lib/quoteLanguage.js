export function normalizeQuoteLanguage(raw) {
  return String(raw || "").trim().toLowerCase() === "de" ? "de" : "en";
}

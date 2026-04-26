import { neon } from "@neondatabase/serverless";

let sqlClient = null;

export function sql() {
  if (sqlClient) return sqlClient;
  if (!process.env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL environment variable.");
  }
  sqlClient = neon(process.env.DATABASE_URL);
  return sqlClient;
}

export function normalizeCodeword(raw) {
  return String(raw || "").trim().toLowerCase();
}

export function toIsoStringOrNull(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function toFiniteNumber(raw, fallback = 0) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

import { neon } from "@neondatabase/serverless";

let sqlClient = null;

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envEntries = Object.entries(process.env || {});
  const exactFallback = envEntries.find(([key, value]) =>
    typeof value === "string" &&
    value &&
    (key.endsWith("_DATABASE_URL") || key.endsWith("_POSTGRES_URL"))
  );
  if (exactFallback) return exactFallback[1];

  return null;
}

export function sql() {
  if (sqlClient) return sqlClient;
  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL environment variable.");
  }
  sqlClient = neon(databaseUrl);
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

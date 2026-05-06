import fs from "node:fs";
import path from "node:path";

export function readEnvLocal() {
  const envPath = path.resolve(".env.local");
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, "utf8");
  const vars = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

export function databaseUrlFromEnv() {
  const envLocal = readEnvLocal();
  return (
    process.env.DATABASE_URL ||
    envLocal.DATABASE_URL ||
    process.env.flauschbabysitterin_db_DATABASE_URL ||
    envLocal.flauschbabysitterin_db_DATABASE_URL ||
    process.env.flauschbabysitterin_db_POSTGRES_URL ||
    envLocal.flauschbabysitterin_db_POSTGRES_URL ||
    null
  );
}

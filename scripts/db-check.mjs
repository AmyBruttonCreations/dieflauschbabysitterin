import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";

function readEnvLocal() {
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

const envLocal = readEnvLocal();

const url =
  process.env.DATABASE_URL ||
  envLocal.DATABASE_URL ||
  process.env.flauschbabysitterin_db_DATABASE_URL ||
  envLocal.flauschbabysitterin_db_DATABASE_URL ||
  process.env.flauschbabysitterin_db_POSTGRES_URL ||
  envLocal.flauschbabysitterin_db_POSTGRES_URL;

if (!url) {
  console.error("NO_DB_URL");
  process.exit(1);
}

const sql = neon(url);
const db = await sql`select current_database() as db`;
const pets = await sql`select count(*)::int as count from pets`;

console.log(
  JSON.stringify(
    {
      db: db[0]?.db,
      pets: pets[0]?.count,
      urlHost: new URL(url).host
    },
    null,
    2
  )
);

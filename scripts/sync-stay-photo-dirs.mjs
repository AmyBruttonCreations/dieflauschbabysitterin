/**
 * Creates assets/pets/<codeword>/stays/<stay_id>/ for:
 * - optional stays listed in src/petDefaults.js (if any), and
 * - every row in Postgres `stays` when DATABASE_URL is set.
 *
 * Run locally when YOU organise photos: npm run stay:dirs
 * Then drop images into those folders and run npm run stay:photos.
 */
import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { DEFAULT_PET_PROFILE_DETAILS } from "../src/petDefaults.js";
import { databaseUrlFromEnv } from "./lib/read-env-local.mjs";

function staysFromPetDefaults() {
  const out = [];
  for (const [cw, detail] of Object.entries(DEFAULT_PET_PROFILE_DETAILS)) {
    const petCodeword = cw.trim().toLowerCase();
    for (const stay of detail.stays || []) {
      const id = String(stay.id || `${stay.start}-${stay.end}`).trim();
      if (!petCodeword || !id) continue;
      out.push({ pet_codeword: petCodeword, id });
    }
  }
  return out;
}

let dbRows = [];
const url = databaseUrlFromEnv();
if (url) {
  try {
    const sql = neon(url);
    dbRows = await sql`
      SELECT id, pet_codeword
      FROM stays
      ORDER BY pet_codeword, start_at
    `;
  } catch (e) {
    console.warn("Could not read stays from database:", e.message);
  }
} else {
  console.warn("No DATABASE_URL — only creating folders from petDefaults stays (if any).");
}

const combined = [...staysFromPetDefaults()];
for (const row of dbRows) {
  const cw = String(row.pet_codeword || "").trim().toLowerCase();
  const id = String(row.id || "").trim();
  if (cw && id) combined.push({ pet_codeword: cw, id });
}

const seen = new Set();
let created = 0;
for (const row of combined) {
  const key = `${row.pet_codeword}:${row.id}`;
  if (seen.has(key)) continue;
  seen.add(key);

  const dir = path.join("assets", "pets", row.pet_codeword, "stays", row.id);
  fs.mkdirSync(dir, { recursive: true });
  const gitkeep = path.join(dir, ".gitkeep");
  if (!fs.existsSync(gitkeep)) {
    fs.writeFileSync(gitkeep, "");
  }
  created += 1;
}

console.log(`Stay photo folders ensured: ${created} under assets/pets/*/stays/`);

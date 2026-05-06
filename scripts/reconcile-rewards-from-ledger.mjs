/**
 * Recomputes rewards.points from paid stays + manual ledger lines minus redemption paw equivalents.
 * Same spirit as db/migration_003_paw_points_numeric.sql but includes invoice amounts stored on stays.
 */
import { neon } from "@neondatabase/serverless";
import { databaseUrlFromEnv } from "./lib/read-env-local.mjs";

const url = databaseUrlFromEnv();
if (!url) {
  console.error("Missing DATABASE_URL (set env or .env.local).");
  process.exit(1);
}

const sql = neon(url);
await sql`
  UPDATE rewards r
  SET points = GREATEST(
    0,
    COALESCE(
      (SELECT SUM(s.invoice_amount) / 10.0 FROM stays s WHERE s.pet_codeword = r.pet_codeword AND s.paid_at IS NOT NULL),
      0
    )
    + COALESCE(
      (SELECT SUM(le.invoice_amount) / 10.0 FROM ledger_entries le WHERE le.pet_codeword = r.pet_codeword),
      0
    )
    - COALESCE(
        (
          SELECT SUM(
              CASE
                WHEN rr.reward_type IN ('portrait50', 'free2days') THEN rr.cost::numeric / 10.0
                ELSE rr.cost::numeric
              END
            )
          FROM reward_redemptions rr
          WHERE rr.pet_codeword = r.pet_codeword
        ),
        0
      )
  )
`;
console.log("OK — rewards.points recomputed from paid stays + ledger_entries + reward_redemptions.");

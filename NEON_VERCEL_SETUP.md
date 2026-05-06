# Neon + Vercel Setup

This project now includes serverless API routes in `api/` backed by Neon Postgres.

## 1) Create and prepare Neon database

1. Create a Neon project/database.
2. Copy your connection string (`DATABASE_URL`).
3. Run the SQL in `db/schema.sql` in the Neon SQL editor.

## 2) Add environment variable in Vercel

In your Vercel project settings, add:

- `DATABASE_URL` = your Neon connection string

Also add this variable in local `.env.local` for testing.

## 3) API routes now available

- `GET /api/health`
- `GET /api/account?codeword=<petCodeword>`
- `POST /api/customer/upsert`
- `POST /api/ledger/add` (manual lines only — not tied to a stay)
- `POST /api/stay/add`
- `POST /api/stay/mark-paid`
- `POST /api/reward/redeem`

## 4) Current migration status

- Paw Points need **`db/migration_003_paw_points_numeric.sql`** on Neon if your DB was created from an older `schema.sql` (integer `rewards.points`). New databases from the current `db/schema.sql` already use numeric columns — you can still run migration 003; it skips `ALTER` when types are already numeric. You do **not** need migration 003 for unrelated tables; **`db/migration_002_customer_names.sql`** is separate (customer name columns only).

- **`db/migration_004_ledger_stay_id.sql`** — legacy; superseded by **`db/migration_005_stay_payment_columns.sql`**, which moves linked payments onto `stays` (`invoice_amount`, `paid_amount`, `paid_at`) and removes `stay_id` from `ledger_entries`. Run **005** once on Neon after deploying the matching API (safe if you never had migration 004).

- **`POST /api/stay/mark-paid`** records payment on a stay and awards Paw Points (same invoice→paw rule as ledger lines).

**If migration 003 fails in the Neon SQL editor**

1. Confirm you’re running against the **same database / branch** your app uses (`DATABASE_URL`).
2. Error **`relation "rewards" does not exist`** → run **`db/schema.sql`** on that database first (creates `rewards`, `reward_redemptions`, etc.).
3. Error **`column ... does not exist`** → schema mismatch; compare your DB to `db/schema.sql`.
4. Copy the **full error message** from Neon — “didn’t work” usually maps to one of the above.

- Backend and database schema are ready for shared cross-device data.
- Existing frontend still reads/writes local browser storage (`src/storage.js`).
- Next step: migrate `src/storage.js` + `src/app.js` calls to these API endpoints so all devices use shared Neon data.

## 5) Suggested migration order (safe rollout)

1. Make account reads (`getCustomerByCodeword`, `getAccountSnapshot`) API-backed.
2. Make mutations (`upsertCustomer`, `addLedgerEntry`, `addStay`, `redeemReward`) API-backed.
3. Keep localStorage only as offline cache/fallback.

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
- `POST /api/ledger/add`
- `POST /api/stay/add`
- `POST /api/reward/redeem`

## 4) Current migration status

- Backend and database schema are ready for shared cross-device data.
- Existing frontend still reads/writes local browser storage (`src/storage.js`).
- Next step: migrate `src/storage.js` + `src/app.js` calls to these API endpoints so all devices use shared Neon data.

## 5) Suggested migration order (safe rollout)

1. Make account reads (`getCustomerByCodeword`, `getAccountSnapshot`) API-backed.
2. Make mutations (`upsertCustomer`, `addLedgerEntry`, `addStay`, `redeemReward`) API-backed.
3. Keep localStorage only as offline cache/fallback.

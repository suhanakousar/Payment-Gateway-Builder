# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## PayLite (artifacts/payments + artifacts/api-server)

Razorpay-like UPI payment aggregator for Indian merchants. Production-shaped backend (real-style provider adapters, smart routing, double-entry ledger, settlements, disputes, KYC) with offline sandbox stubs so the integration code is real but works without external network.

### Auth & session
- Cookie-session (httpOnly, signed) + CSRF token rotation on login (`GET /api/auth/csrf`)
- Password hashing via bcryptjs

### Provider adapters & smart router (`artifacts/api-server/src/providers/`)
- `decentro.ts` — **primary provider**; UPI collection via Decentro API (`/v2/payments/upi/link`); virtual account per merchant for auto-routing; falls back to `DECENTRO_PAYEE_ACCOUNT` if virtual accounts not enabled; HMAC-SHA256 webhook via `x-decentro-signature`
- `cashfree.ts` — Cashfree Easy Split (weight 5, fallback only); LIVE when `CASHFREE_APP_ID`+`CASHFREE_SECRET_KEY` set
- `razorpay.ts` — local sandbox stub (weight 0 by default)
- `mock.ts` — fallback `qr_<id>` provider (weight 5)
- `router.ts` — weighted selection (decentro 90 / cashfree 5 / mock 5), per-provider circuit breaker (opens after 3 consecutive failures, 60s cool-down), automatic fallback to next healthy provider on `createQR` failure
- `/api/dashboard/provider-health` exposes per-provider success rate + circuit state
- Webhook receiver `controllers/providerWebhook.ts` routes by `?provider=decentro|cashfree` and verifies with the matching scheme

### Settlements + double-entry ledger
- Fee calc in `services/fees.ts`: 2% + ₹2 GST in paise, stored on `orders.fee_paise` at SUCCESS time
- T+1 settlement job groups merchant's previous-day SUCCESS orders, creates one `settlements` row + double-entry `ledger_entries` (DEBIT `gateway_payable`, CREDIT `merchant_payable` and `fee_income`)
- `POST /api/settlements/run` — manual trigger (dev)
- `GET /api/settlements` — pending + last 30 days for `/settlements` page
- Repository uses `inArray()` from drizzle-orm for batch lookups (do NOT use `ANY(${array})`)

### Disputes
- Status workflow: `OPEN → UNDER_REVIEW → WON | LOST`, 7-day evidence deadline
- Provider webhook event `payment.disputed` creates dispute and blocks refunds while open (refund returns 409)
- `POST /api/disputes/:id/evidence` (text + 1 doc URL) → `UNDER_REVIEW`
- `POST /api/disputes/:id/resolve` with `outcome: WON|LOST`; on WON, sets `resolutionNote = "Issuer accepted merchant evidence"`
- `/disputes` page lists all; dashboard shows open count + alert banner

### KYC workflow
- Status: `NOT_STARTED → SUBMITTED → UNDER_REVIEW → APPROVED | REJECTED`
- `kyc_documents` table holds PAN + cancelled-cheque metadata with simulated upload URL (data URI accepted)
- Auto-approve in dev after 5s for demo
- `services/orders.ts` blocks order creation > ₹10,000 unless status is `APPROVED` (also accepts legacy `VERIFIED`)
- `/kyc` page redesigned as a stepper with doc upload

### Dashboard polish (`artifacts/payments/src/pages/dashboard.tsx`)
- 14-day revenue area chart (Recharts)
- Payment method donut + provider distribution donut
- Open-dispute alert banner
- Settlement summary card (pending + last batch)
- Provider health card
- Webhooks page: row → drawer with full event/requestBody/response payload

### Order flow notes
- `POST /api/orders` body: `{orderId, amount, customerName?, customerEmail?, note?}` — `orderId` is the merchant's reference (REQUIRED)
- Response includes provider `txnId` (e.g. `rzp_order_…`, `qr_…`)
- Simulate endpoint: `POST /api/orders/:txnId/simulate` body `{outcome: "SUCCESS"|"FAILED"}` — note `:txnId` not order id
- CSRF rotates after login — re-fetch `/api/auth/csrf` after `POST /api/auth/login`
- Lazy `expireStaleOrders()` flips PENDING → EXPIRED on read (5 min expiry)

### Demo credentials
- email: `demo@paylite.in`
- password: `demo1234`
- business: Sundar Tea Stall (4 historical orders pre-seeded, KYC APPROVED)

### Env vars
- `SESSION_SECRET` — session signing secret (provisioned)
- `WEBHOOK_SECRET` — HMAC secret for payment webhooks (optional in dev; literal `dev-signature` accepted)
- `DATABASE_URL` — Postgres (provisioned)
- `DEFAULT_PROVIDER` — active provider name (set to `decentro`)
- `PROVIDER_WEIGHTS` — comma-separated weights e.g. `decentro:90,cashfree:5,mock:5`
- `DECENTRO_CLIENT_ID` — Decentro API client ID (required for LIVE mode)
- `DECENTRO_CLIENT_SECRET` — Decentro API client secret (required for LIVE mode)
- `DECENTRO_MODULE_SECRET` — Decentro module secret (required for LIVE mode; also used as webhook HMAC key)
- `DECENTRO_PROVIDER_SECRET` — Decentro provider secret (optional; needed for specific bank providers)
- `DECENTRO_PAYEE_ACCOUNT` — platform UPI VPA/account for collection (fallback when virtual accounts not used)
- `DECENTRO_WEBHOOK_SECRET` — override webhook HMAC key (defaults to `DECENTRO_MODULE_SECRET`)

### DB tables (lib/db/src/schema)
- `merchants` — auth + KYC status (`kyc_status`, `kyc_submitted_at`, `kyc_reviewed_at`, `kyc_rejection_reason`)
- `kyc_documents` — PAN, cancelled cheque metadata + URL
- `orders` — amount, currency, status, upi_qr_data, expires_at, txn_id, `payment_method`, `provider`, `fee_paise`, `settled_at`, `settlement_id`
- `settlements` — daily merchant batch (utr, gross, fee, net, status)
- `ledger_entries` — double-entry rows (`account`, `direction`, `amount_paise`, `ref_settlement_id`/`ref_order_id`)
- `disputes` — status, reason, amount, evidence_text, evidence_url, deadline_at, resolution_note
- `webhook_events` — idempotency log keyed on `txn_id`, stores `event` + `request_body` for the inspector drawer

### Workflows
- `API Server` — `PORT=8080 pnpm --filter @workspace/api-server run dev` (restart after backend changes)
- `Start application` — `PORT=19926 BASE_PATH=/ pnpm --filter @workspace/payments run dev` (Vite hot-reloads frontend)

### E2E verified (2026-04-26)
Login → create ₹350 order routed to `razorpay` → simulate SUCCESS → raise dispute → submit evidence (→ UNDER_REVIEW) → refund correctly BLOCKED (409) while dispute open → resolve WON → run settlement (2 batches with proper double-entry ledger). Dashboard summary reflects openDisputes + pendingSettlement.

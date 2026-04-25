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

Mini Razorpay-like UPI payment platform for Indian merchants.

### Features
- Merchant signup / login (JWT in `localStorage`, password hashing via bcryptjs)
- KYC profile (PAN, bank account, IFSC) on `/kyc`
- Order CRUD: create dynamic UPI QR orders via mock provider (`qrcode` lib)
- Public payment page `/pay/:orderId` with countdown (5 min expiry), QR display, status polling, and a built-in "simulate payment" panel
- Webhook endpoint `/api/webhook/payment` with HMAC-SHA256 signature verification (accepts literal `dev-signature` in dev) and idempotency via `webhook_events` unique on `txn_id`
- Merchant dashboard: KPI cards, 14-day revenue chart (Recharts), recent orders
- Lazy `expireStaleOrders()` flips PENDING → EXPIRED on read

### Demo credentials
- email: `demo@paylite.in`
- password: `demo1234`
- business: Sundar Tea Stall (4 historical orders pre-seeded)

### Env vars
- `SESSION_SECRET` — JWT signing secret (provisioned)
- `WEBHOOK_SECRET` — HMAC secret for payment webhooks (optional in dev)
- `DATABASE_URL` — Postgres (provisioned)

### DB tables (lib/db/src/schema)
- `merchants` — auth + KYC fields
- `orders` — amount, currency, status, upi_qr_data, expires_at, txn_id
- `webhook_events` — idempotency log keyed on `txn_id`

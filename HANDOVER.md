# PayLite Production Handover — Cashfree Easy Split

## What this system is

PayLite is a multi-merchant payment platform built on top of **one** Cashfree account. Each PayLite merchant onboards as a **Cashfree Easy Split vendor**. Customers pay into Cashfree's collection account; Cashfree auto-splits and settles each payment to the correct merchant's bank account on T+1. PayLite owns merchant onboarding, KYC capture, the dashboard, order/QR creation, webhook handling, and reconciliation. Cashfree owns the money rails, settlement engine, and the provider-side KYC verification.

## Money flow (real)

```
1. Merchant signs up in PayLite
2. Merchant submits KYC (PAN + bank account number + IFSC + holder name)
3. Merchant uploads supporting docs (PAN card, cancelled cheque)
4. PayLite KYC approval → ensureVendor() calls Cashfree Easy Split:
       POST /pg/easy-split/vendors  → vendor_id
5. Cashfree verifies the bank account (penny-drop or matching) → vendor status flips to ACTIVE
   (vendor-sync cron polls every 2 min until then)
6. Merchant creates order:
       POST /pg/orders
         body.order_splits = [{ vendor_id, percentage: 100 }]
       POST /pg/orders/pay
         body.payment_method.upi.channel = "qrcode"
       → Cashfree returns a dynamic UPI intent string keyed to its nodal VPA
       → PayLite renders that string as a QR PNG and shows it on /payment/:orderId
7. Customer scans → pays into Cashfree's collection account
8. Cashfree fires webhook → PayLite verifies HMAC, dedupes, marks SUCCESS,
   updates merchant dashboard
9. Cashfree settlement engine (T+1) splits the captured amount per
   order_splits and credits the merchant's bank account
10. PayLite's own settlement table records the merchant-facing view
    (gross / fee / net) and the double-entry ledger for accounting
```

## Required environment variables

### Core (always required)

| Var | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `PORT` | API server port (default 8080) |
| `SESSION_SECRET` | ≥24 chars in production. Used for cookie signing AND AES-256-GCM encryption of stored PAN / bank / vendor IDs. **Rotating this loses access to previously encrypted values.** |
| `DEFAULT_PROVIDER` | `cashfree` |

### Cashfree (required for real money flow)

| Var | Description |
|---|---|
| `CASHFREE_APP_ID` | From cashfree.com → Developers → API Keys |
| `CASHFREE_SECRET_KEY` | Pair of the above |
| `CASHFREE_WEBHOOK_SECRET` | From the webhook configuration on the Cashfree dashboard |
| `CASHFREE_BASE` | `https://api.cashfree.com/pg` (live) or `https://sandbox.cashfree.com/pg` (test). Auto-selected from `CASHFREE_APP_ID` presence if unset. |
| `CASHFREE_API_VERSION` | Default `2023-08-01` |

When `CASHFREE_APP_ID` + `CASHFREE_SECRET_KEY` are missing, the adapter falls back to a sandbox stub: it issues a fake `cf_order_<hex>` id, builds a UPI intent locally, and **does not move real money**. Useful for dev, but real customers cannot pay in this mode.

### Optional

| Var | Description |
|---|---|
| `PROVIDER_WEIGHTS` | `cashfree:100` to force all traffic to Cashfree (default also includes Razorpay/mock) |
| `WEBHOOK_SECRET` | Fallback signing key for outbound merchant webhooks |
| `LOG_LEVEL` | `info`/`debug` |
| `CORS_ORIGIN` | Comma-separated list of allowed origins |

## One-time Cashfree dashboard setup

You need to do all of these on https://merchant.cashfree.com before live mode works:

1. **Create the Cashfree business account** with your real PAN + GST + bank account. This is YOUR business account; merchants will be vendors under it. KYB takes 1–3 business days.
2. **Activate Easy Split.** Cashfree Dashboard → Products → Easy Split → enable. (If it's not visible to you, raise a support ticket — it requires PA-license-side approval.)
3. **Generate API keys.** Developers → API Keys → Production → Generate. Copy the App ID + Secret Key into env.
4. **Configure webhook URL.** Developers → Webhooks → Add Webhook → URL `https://YOUR-DOMAIN/api/webhook?provider=cashfree` → Events: `PAYMENT_SUCCESS_WEBHOOK`, `PAYMENT_FAILED_WEBHOOK`, `DISPUTE_CREATED`. Copy the webhook signing secret.
5. **Whitelist the webhook URL** if Cashfree requires it (only needed in some account configs).
6. **Test mode first.** Repeat steps 3 + 4 with the sandbox keys (https://sandbox.cashfree.com) and verify a ₹1 test payment reaches a sandbox vendor's mock bank.

## Database migration

After pulling these changes, run:

```bash
pnpm --filter @workspace/db run push
```

The schema adds `merchants.bank_account_holder_name` (text, nullable). Existing rows are unaffected — but those merchants must re-submit KYC (or you backfill the column manually) before they can be registered as vendors.

## Operational gotchas

- **Cashfree can't webhook localhost.** For real-money testing you need a public HTTPS URL — deploy to Replit/Render/Fly/Vercel, or use `cloudflared`/`ngrok` for an HTTPS tunnel.
- **Vendor activation is async.** When KYC is approved, `ensureVendor()` is called immediately, but Cashfree's bank-account verification can take from seconds to minutes. The `vendor-sync` cron polls `GET /easy-split/vendors/{id}` every 2 min and flips the merchant to `providerStatus=ACTIVE` when done. Order creation is blocked with HTTP 412 until then.
- **PAN + bank holder name must match.** Cashfree rejects vendor records where the holder name doesn't match the bank's records. Reject reason is surfaced on the merchant in `merchant.providerStatus = REJECTED` (and we don't currently expose the reason field — todo if needed).
- **`SESSION_SECRET` rotation = data loss.** PAN, bank account, and vendor IDs are encrypted with a key derived from this secret. Rotating it makes all previously encrypted columns unreadable. Don't rotate.
- **Test mode webhooks have a different secret.** Don't reuse the live `CASHFREE_WEBHOOK_SECRET` for sandbox.
- **Order ID uniqueness.** PayLite stores Cashfree's `cf_order_id` in `orders.txn_id`, which has a global unique index. Multiple merchants using the same `orderId` reference is fine because we look up by `cf_order_id` in webhooks now.

## Code map (what to look at in each file)

- `lib/db/src/schema/merchants.ts` — schema; `bank_account_holder_name` is the new field. `provider_merchant_id` holds the Cashfree vendor_id; `provider_status` holds the vendor verification state.
- `artifacts/api-server/src/providers/cashfree.ts` — the real adapter. `createQR` calls `/orders` with `order_splits` then `/orders/pay` with `upi.channel=qrcode`. `createVendor` and `getVendorStatus` hit Easy Split.
- `artifacts/api-server/src/services/vendor.ts` — `ensureVendor(merchantId)` is idempotent and called from KYC approval + the sync cron.
- `artifacts/api-server/src/services/kyc.ts` — `autoApprovePendingKyc()` (dev only) approves merchants with valid bank details + docs and triggers vendor registration.
- `artifacts/api-server/src/services/orders.ts` — order creation is blocked unless `providerMerchantId` exists AND `providerStatus === "ACTIVE"`.
- `artifacts/api-server/src/jobs/index.ts` — vendor-sync cron registered alongside expire / reconcile / settle / kyc-auto.

## What is still NOT in code (you must do this manually)

- Real Cashfree business account + KYB.
- Real production API keys.
- Real webhook URL pointing at your deployed PayLite.
- Real merchant signups with real PAN + real bank accounts (Cashfree's verification rejects fakes in live mode).
- Public HTTPS deployment (so Cashfree's webhook can reach the API).

Without the items above, the codebase runs in **sandbox mode**: vendor creation returns a fake `sandbox_v_xxx` id with status ACTIVE immediately, the QR is a self-built UPI intent, and **no money moves**. This is correct for development and demos.

## Demo credentials (sandbox)

- email: `demo@paylite.in`
- password: `demo1234`
- vendor: `sandbox_v_demo` (instantly ACTIVE)
- 4 historical orders pre-seeded

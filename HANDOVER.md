# PayLite Handover Notes

## What this system is

PayLite is a merchant-facing payment platform that sits on top of a third-party payment provider such as Cashfree, Razorpay, Decentro, or Pine Labs.

It is **not** an independent payment aggregator. The provider remains the payment rail. PayLite owns:

- merchant onboarding
- merchant dashboard
- order creation
- dynamic QR presentation
- webhook processing
- payment status tracking
- refund/dispute/settlement visibility

## Multi-merchant payment flow

1. Merchant signs up in PayLite.
2. Merchant completes KYC and provider mapping.
3. Merchant provider mapping is stored on the merchant profile:
   - `preferredProvider`
   - `providerMerchantId`
   - `providerStoreId`
   - `providerTerminalId`
   - `providerReference`
   - `providerVpa`
4. When the merchant creates an order, the backend generates a provider order/QR using that merchant’s mapping.
5. Customer pays using the QR shown on the public payment page.
6. Provider sends a webhook or becomes visible through status reconciliation.
7. PayLite marks the order `SUCCESS`/`FAILED` and updates the dashboard.
8. If the merchant has outbound webhooks configured, PayLite delivers signed events to the merchant system.

This lets multiple merchants use one shared integration while still routing each payment to the correct merchant mapping inside the provider.

## Production-path changes already made

- merchant-level provider mapping support added
- public payment page demo controls disabled unless `VITE_ENABLE_DEMO_CONTROLS=true`
- outbound merchant webhooks moved from in-memory queue to DB-backed delivery jobs
- background worker now processes durable webhook jobs
- provider fallback now prefers `DEFAULT_PROVIDER` over mock defaults
- workspace scripts made more cross-platform friendly

## Required environment variables

### Core

- `DATABASE_URL`
- `PORT`
- `SESSION_SECRET`
- `DEFAULT_PROVIDER`

### Optional provider examples

- `CASHFREE_APP_ID`
- `CASHFREE_SECRET_KEY`
- `CASHFREE_WEBHOOK_SECRET`
- `CASHFREE_BASE`
- `CASHFREE_VPA`

- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `RAZORPAY_VPA`

## Recommended production defaults

- `NODE_ENV=production`
- `DEFAULT_PROVIDER=cashfree`
- do not enable demo controls
- use HTTPS for frontend, backend, and merchant webhooks
- provision a persistent PostgreSQL database

## Database rollout

Schema changes were added for:

- merchant provider mapping fields
- durable webhook delivery jobs

Before production use, apply the updated schema to your database.

## Final live-integration step

The codebase is now structured for a real provider-backed multi-merchant flow, but you still need the **actual provider API contract and credentials** for your chosen gateway.

For a final live rollout, wire the exact provider fields required by:

- Decentro, or
- Pine Labs, or
- the gateway you finally choose

into the provider adapter under `artifacts/api-server/src/providers/`.

import * as ordersRepo from "../repositories/orders";
import { getProvider } from "../providers";
import { calculateFeePaise } from "../services/fees";
import {
  enqueueDelivery,
  processPendingDeliveries,
} from "../services/merchantWebhookDelivery";
import { runSettlementForDate } from "../services/settlement";
import { autoApprovePendingKyc } from "../services/kyc";
import { syncPendingVendors } from "../services/vendor";

const EXPIRE_INTERVAL_MS = 60_000; // 1 minute
const RECONCILE_INTERVAL_MS = 10_000; // 10 seconds
const WEBHOOK_INTERVAL_MS = 5_000;
const RECONCILE_AGE_MS = 20_000; // older than 20 seconds
const RECONCILE_BATCH = 50;
const SETTLEMENT_INTERVAL_MS = 60 * 60_000; // hourly check
const KYC_AUTO_INTERVAL_MS = 5_000; // dev: poll for SUBMITTED kyc to auto-approve
const VENDOR_SYNC_INTERVAL_MS = 2 * 60_000; // every 2 min: poll provider for PENDING vendor activations

let started = false;
const timers: NodeJS.Timeout[] = [];

async function expireRun(): Promise<void> {
  try {
    const expired = await ordersRepo.expireOlderThan(new Date());
    if (expired.length > 0) {
      console.log(`[cron:expire] expired ${expired.length} orders`);
    }
  } catch (e) {
    console.error("[cron:expire] failed", e);
  }
}

async function reconcileRun(): Promise<void> {
  try {
    const pending = await ordersRepo.listPendingNeedingReconcile({
      olderThanMs: RECONCILE_AGE_MS,
      limit: RECONCILE_BATCH,
    });
    if (pending.length === 0) return;
    let updates = 0;
    for (const order of pending) {
      if (!order.txnId) continue;
      const provider = getProvider(order.provider);
      try {
        const status = await provider.fetchPaymentStatus(order.txnId);
        if (status === "SUCCESS") {
          const fee = calculateFeePaise(Number(order.amount));
          const updated = await ordersRepo.markPaid({
            orderId: order.id,
            txnId: order.txnId,
            paymentMethod: "UPI",
            feePaise: fee,
          });
          if (updated) {
            updates++;
            await enqueueDelivery({ order: updated, event: "payment.success" });
          }
        } else if (status === "FAILED") {
          const updated = await ordersRepo.markFailed(order.id);
          if (updated) {
            updates++;
            await enqueueDelivery({ order: updated, event: "payment.failed" });
          }
        }
      } catch (e) {
        console.error(`[cron:reconcile] provider error for ${order.id}`, e);
      }
    }
    if (updates > 0) {
      console.log(`[cron:reconcile] reconciled ${updates} orders`);
    }
  } catch (e) {
    console.error("[cron:reconcile] failed", e);
  }
}

async function webhookRun(): Promise<void> {
  try {
    await processPendingDeliveries();
  } catch (e) {
    console.error("[cron:webhooks] failed", e);
  }
}

/**
 * Daily settlement run: settles SUCCESS orders from yesterday into one
 * settlement per merchant. Idempotent — `settlements_date_idx` makes a second
 * call for the same date a no-op.
 */
async function settlementRun(): Promise<void> {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateKey = yesterday.toISOString().slice(0, 10);
    const result = await runSettlementForDate(dateKey);
    if (result.settled > 0) {
      console.log(
        `[cron:settle] created ${result.settled} settlements for ${dateKey}`,
      );
    }
  } catch (e) {
    console.error("[cron:settle] failed", e);
  }
}

async function kycAutoRun(): Promise<void> {
  if (process.env["NODE_ENV"] === "production") return;
  try {
    const n = await autoApprovePendingKyc();
    if (n > 0) console.log(`[cron:kyc] auto-approved ${n} merchants`);
  } catch (e) {
    console.error("[cron:kyc] failed", e);
  }
}

async function vendorSyncRun(): Promise<void> {
  try {
    const n = await syncPendingVendors();
    if (n > 0) console.log(`[cron:vendors] updated ${n} vendor states`);
  } catch (e) {
    console.error("[cron:vendors] failed", e);
  }
}

export function startJobs(): void {
  if (started) return;
  started = true;
  setTimeout(() => void expireRun(), 5_000);
  setTimeout(() => void webhookRun(), 7_500);
  setTimeout(() => void reconcileRun(), 10_000);
  setTimeout(() => void settlementRun(), 15_000);
  setTimeout(() => void vendorSyncRun(), 20_000);
  timers.push(setInterval(() => void expireRun(), EXPIRE_INTERVAL_MS));
  timers.push(setInterval(() => void webhookRun(), WEBHOOK_INTERVAL_MS));
  timers.push(setInterval(() => void reconcileRun(), RECONCILE_INTERVAL_MS));
  timers.push(setInterval(() => void settlementRun(), SETTLEMENT_INTERVAL_MS));
  timers.push(setInterval(() => void kycAutoRun(), KYC_AUTO_INTERVAL_MS));
  timers.push(setInterval(() => void vendorSyncRun(), VENDOR_SYNC_INTERVAL_MS));
  console.log("[jobs] background workers started");
}

export function stopJobs(): void {
  for (const t of timers) clearInterval(t);
  timers.length = 0;
  started = false;
}

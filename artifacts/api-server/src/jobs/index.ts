import * as ordersRepo from "../repositories/orders";
import { getProvider } from "../providers";
import { enqueueDelivery } from "../services/merchantWebhookDelivery";

const EXPIRE_INTERVAL_MS = 60_000; // 1 minute
const RECONCILE_INTERVAL_MS = 5 * 60_000; // 5 minutes
const RECONCILE_AGE_MS = 2 * 60_000; // older than 2 minutes
const RECONCILE_BATCH = 50;

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
          const updated = await ordersRepo.markPaid({
            orderId: order.id,
            txnId: order.txnId,
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

export function startJobs(): void {
  if (started) return;
  started = true;
  // Stagger startup to avoid hammering DB right when server boots.
  setTimeout(() => void expireRun(), 5_000);
  setTimeout(() => void reconcileRun(), 10_000);
  timers.push(setInterval(() => void expireRun(), EXPIRE_INTERVAL_MS));
  timers.push(setInterval(() => void reconcileRun(), RECONCILE_INTERVAL_MS));
  console.log("[jobs] background workers started");
}

export function stopJobs(): void {
  for (const t of timers) clearInterval(t);
  timers.length = 0;
  started = false;
}

import * as merchantWebhooksRepo from "../repositories/merchantWebhooks";
import * as deliveryJobsRepo from "../repositories/webhookDeliveryJobs";
import * as logsRepo from "../repositories/webhookLogs";
import { hmacSha256Hex } from "../utils/crypto";
import { toPublic } from "./orders";
import type { Order } from "@workspace/db";

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 5_000, 15_000];
const TIMEOUT_MS = 7_000;
const CLAIM_BATCH = 20;
const STALE_LOCK_MS = 60_000;

export type WebhookEvent =
  | "payment.success"
  | "payment.failed"
  | "payment.refunded"
  | "payment.disputed"
  | "test.ping";

function buildPayload(order: Order, event: WebhookEvent): string {
  return JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    order: toPublic(order),
  });
}

export async function enqueueDelivery(input: {
  order: Order;
  event: WebhookEvent;
}): Promise<void> {
  const targets = await merchantWebhooksRepo.listEnabledForMerchant(
    input.order.merchantId,
  );
  if (targets.length === 0) return;

  const payload = buildPayload(input.order, input.event);
  await deliveryJobsRepo.enqueueMany(
    targets.map((t) => ({
      orderId: input.order.id,
      merchantWebhookId: t.id,
      url: t.webhookUrl,
      secret: t.webhookSecret,
      payload,
      event: input.event,
    })),
  );
}

async function runJob(job: Awaited<ReturnType<typeof deliveryJobsRepo.claimReady>>[number]): Promise<void> {
  const attempt = job.attempt + 1;
  const signature = hmacSha256Hex(job.secret, job.payload);
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let responseCode: number | null = null;
  let responseBody: string | null = null;
  let error: string | null = null;
  let ok = false;

  try {
    const res = await fetch(job.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "PayLite-Webhook/1.0",
        "x-paylite-event": job.event,
        "x-paylite-signature": signature,
        "x-paylite-attempt": String(attempt),
      },
      body: job.payload,
      signal: controller.signal,
    });
    responseCode = res.status;
    const text = await res.text().catch(() => "");
    responseBody = text.slice(0, 1024);
    ok = res.ok;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  } finally {
    clearTimeout(timeoutHandle);
  }

  const finalAttempt = attempt >= MAX_ATTEMPTS;
  const status = ok ? "SENT" : finalAttempt ? "FAILED" : "RETRY";
  await logsRepo.insertLog({
    orderId: job.orderId,
    merchantWebhookId: job.merchantWebhookId,
    event: job.event,
    requestBody: job.payload.slice(0, 4096),
    attempt,
    status,
    responseCode,
    responseBody,
    error,
  });

  if (ok) {
    await deliveryJobsRepo.markSent(job.id, {
      attempt,
      responseCode,
      responseBody,
    });
    return;
  }

  if (finalAttempt) {
    await deliveryJobsRepo.markFailed(job.id, {
      attempt,
      responseCode,
      responseBody,
      error,
    });
    return;
  }

  const delay = BACKOFF_MS[attempt] ?? 15_000;
  await deliveryJobsRepo.markRetry(job.id, {
    attempt,
    availableAt: new Date(Date.now() + delay),
    responseCode,
    responseBody,
    error,
  });
}

export async function processPendingDeliveries(): Promise<void> {
  await deliveryJobsRepo.releaseStaleLocks(STALE_LOCK_MS);
  const jobs = await deliveryJobsRepo.claimReady(CLAIM_BATCH);
  for (const job of jobs) {
    await runJob(job);
  }
}

/**
 * Sends a one-off "test.ping" event to a single webhook. Used by the dashboard
 * to let merchants verify their receiver works.
 */
export async function sendTestPing(input: {
  webhookId: string;
  merchantId: string;
}): Promise<{ ok: boolean; status: number | null; error: string | null }> {
  const w = await merchantWebhooksRepo.findForMerchant(
    input.webhookId,
    input.merchantId,
  );
  if (!w) return { ok: false, status: null, error: "Webhook not found" };

  const payload = JSON.stringify({
    event: "test.ping",
    timestamp: new Date().toISOString(),
    message: "PayLite test webhook",
  });
  const signature = hmacSha256Hex(w.webhookSecret, payload);
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(w.webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "PayLite-Webhook/1.0",
        "x-paylite-event": "test.ping",
        "x-paylite-signature": signature,
      },
      body: payload,
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, status: null, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

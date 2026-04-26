import * as merchantWebhooksRepo from "../repositories/merchantWebhooks";
import * as logsRepo from "../repositories/webhookLogs";
import { hmacSha256Hex } from "../utils/crypto";
import { toPublic } from "./orders";
import type { Order } from "@workspace/db";

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 5_000, 15_000];
const TIMEOUT_MS = 7_000;

export type WebhookEvent =
  | "payment.success"
  | "payment.failed"
  | "payment.refunded"
  | "test.ping";

interface DeliveryJob {
  order: Order;
  event: WebhookEvent;
  attempt: number;
  webhookId: string;
  url: string;
  secret: string;
  payload: string;
}

/**
 * Lightweight in-memory queue. Persistence isn't required: failed deliveries
 * are recorded with status RETRY and re-attempted by the periodic worker.
 */
const queue: DeliveryJob[] = [];
let timer: NodeJS.Timeout | null = null;

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
  for (const t of targets) {
    queue.push({
      order: input.order,
      event: input.event,
      attempt: 1,
      webhookId: t.id,
      url: t.webhookUrl,
      secret: t.webhookSecret,
      payload,
    });
  }
  scheduleProcess();
}

function scheduleProcess(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void processQueue();
  }, 50);
}

async function processQueue(): Promise<void> {
  while (queue.length > 0) {
    const job = queue.shift()!;
    await runJob(job);
  }
}

async function runJob(job: DeliveryJob): Promise<void> {
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
        "x-paylite-attempt": String(job.attempt),
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

  const finalAttempt = job.attempt >= MAX_ATTEMPTS;
  const status = ok ? "SENT" : finalAttempt ? "FAILED" : "RETRY";
  await logsRepo.insertLog({
    orderId: job.order.id,
    merchantWebhookId: job.webhookId,
    attempt: job.attempt,
    status,
    responseCode,
    responseBody,
    error,
  });

  if (!ok && !finalAttempt) {
    const delay = BACKOFF_MS[job.attempt] ?? 15_000;
    setTimeout(() => {
      queue.push({ ...job, attempt: job.attempt + 1 });
      scheduleProcess();
    }, delay);
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

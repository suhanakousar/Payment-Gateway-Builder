import * as ordersRepo from "../repositories/orders";
import * as eventsRepo from "../repositories/webhookEvents";
import { hmacSha256Hex, timingSafeEqualHex } from "../utils/crypto";
import { enqueueDelivery } from "./merchantWebhookDelivery";

const isProd = process.env["NODE_ENV"] === "production";
const WEBHOOK_SECRET =
  process.env["WEBHOOK_SECRET"] ?? (isProd ? "" : "dev-webhook-secret");

if (isProd && !WEBHOOK_SECRET) {
  throw new Error("WEBHOOK_SECRET must be set in production.");
}

export class WebhookError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface ProviderWebhookInput {
  rawBody: Buffer;
  signature: string | undefined;
}

interface ParsedBody {
  txn_id?: string;
  status?: string;
}

export async function processProviderWebhook(
  input: ProviderWebhookInput,
): Promise<{ ok: true; deduped: boolean }> {
  if (!input.signature) {
    throw new WebhookError("Missing signature", 401);
  }
  const expected = hmacSha256Hex(WEBHOOK_SECRET, input.rawBody);
  if (!timingSafeEqualHex(expected, input.signature)) {
    throw new WebhookError("Invalid signature", 401);
  }

  let body: ParsedBody;
  try {
    body = JSON.parse(input.rawBody.toString("utf8"));
  } catch {
    throw new WebhookError("Invalid JSON body");
  }
  if (!body.txn_id || !body.status) {
    throw new WebhookError("txn_id and status required");
  }
  const status = body.status.toUpperCase();
  if (!["SUCCESS", "FAILED"].includes(status)) {
    throw new WebhookError("Unsupported status");
  }

  const dedupe = await eventsRepo.recordIfNew({
    txnId: body.txn_id,
    status,
  });
  if (!dedupe.inserted) {
    return { ok: true, deduped: true };
  }

  const order = await ordersRepo.findByTxn(body.txn_id);
  if (!order) {
    return { ok: true, deduped: false };
  }
  if (order.status !== "PENDING") {
    return { ok: true, deduped: true };
  }

  const updated =
    status === "SUCCESS"
      ? await ordersRepo.markPaid({ orderId: order.id, txnId: body.txn_id })
      : await ordersRepo.markFailed(order.id);

  if (updated) {
    await enqueueDelivery({
      order: updated,
      event: status === "SUCCESS" ? "payment.success" : "payment.failed",
    });
  }
  return { ok: true, deduped: false };
}

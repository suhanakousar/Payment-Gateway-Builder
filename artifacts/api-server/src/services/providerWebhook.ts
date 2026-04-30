import * as ordersRepo from "../repositories/orders";
import * as eventsRepo from "../repositories/webhookEvents";
import * as disputesRepo from "../repositories/disputes";
import { providerRouter, getProvider } from "../providers";
import { calculateFeePaise } from "./fees";
import { enqueueDelivery } from "./merchantWebhookDelivery";

export class WebhookError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface ProviderWebhookInput {
  rawBody: Buffer;
  headers: Record<string, string | undefined>;
  /** ?provider=razorpay — selects which adapter parses the payload. Defaults to "mock". */
  providerName: string;
}

const DISPUTE_DEADLINE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function processProviderWebhook(
  input: ProviderWebhookInput,
): Promise<{ ok: true; deduped: boolean; provider: string }> {
  const provider =
    providerRouter.get(input.providerName) ??
    getProvider(process.env["DEFAULT_PROVIDER"] ?? "cashfree");

  let parsed;
  try {
    parsed = provider.parseWebhook(input.rawBody, input.headers);
  } catch (e) {
    throw new WebhookError(
      e instanceof Error ? e.message : "Webhook parse failed",
      e instanceof Error && /signature/i.test(e.message) ? 401 : 400,
    );
  }

  const dedupe = await eventsRepo.recordIfNew({
    txnId: `${provider.name}:${parsed.txnId}:${parsed.dispute ? "dispute" : parsed.status}`,
    status: parsed.status,
  });
  if (!dedupe.inserted) {
    return { ok: true, deduped: true, provider: provider.name };
  }

  const order = await ordersRepo.findByTxn(parsed.txnId);
  if (!order) {
    return { ok: true, deduped: false, provider: provider.name };
  }

  // Dispute path — order should already be SUCCESS
  if (parsed.dispute) {
    if (order.status !== "SUCCESS") {
      return { ok: true, deduped: false, provider: provider.name };
    }
    await disputesRepo.create({
      merchantId: order.merchantId,
      orderId: order.id,
      providerDisputeId: null,
      reason: parsed.dispute.reason,
      amountPaise: Math.round(parsed.dispute.amount * 100) || Math.round(Number(order.amount) * 100),
      status: "OPEN",
      evidenceText: null,
      evidenceUrl: null,
      resolutionNote: null,
      deadlineAt: new Date(Date.now() + DISPUTE_DEADLINE_MS),
      submittedAt: null,
      resolvedAt: null,
    });
    await enqueueDelivery({ order, event: "payment.disputed" });
    return { ok: true, deduped: false, provider: provider.name };
  }

  if (order.status !== "PENDING") {
    return { ok: true, deduped: true, provider: provider.name };
  }

  let updated;
  if (parsed.status === "SUCCESS") {
    const fee = calculateFeePaise(Number(order.amount));
    updated = await ordersRepo.markPaid({
      orderId: order.id,
      txnId: parsed.txnId,
      paymentMethod: parsed.paymentMethod ?? "UPI",
      feePaise: fee,
    });
  } else if (parsed.status === "FAILED") {
    updated = await ordersRepo.markFailed(order.id);
  } else {
    return { ok: true, deduped: false, provider: provider.name };
  }

  if (updated) {
    await enqueueDelivery({
      order: updated,
      event: parsed.status === "SUCCESS" ? "payment.success" : "payment.failed",
    });
  }
  return { ok: true, deduped: false, provider: provider.name };
}

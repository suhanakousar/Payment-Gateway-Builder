import * as disputesRepo from "../repositories/disputes";
import * as ordersRepo from "../repositories/orders";
import { OrderError } from "./orders";
import type { Dispute } from "@workspace/db";

export interface DisputePublic {
  id: string;
  orderId: string;
  reason: string;
  amountPaise: number;
  status: string;
  evidenceText: string | null;
  evidenceUrl: string | null;
  resolutionNote: string | null;
  deadlineAt: string;
  submittedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export function toPublic(d: Dispute): DisputePublic {
  return {
    id: d.id,
    orderId: d.orderId,
    reason: d.reason,
    amountPaise: d.amountPaise,
    status: d.status,
    evidenceText: d.evidenceText,
    evidenceUrl: d.evidenceUrl,
    resolutionNote: d.resolutionNote,
    deadlineAt: d.deadlineAt.toISOString(),
    submittedAt: d.submittedAt ? d.submittedAt.toISOString() : null,
    resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null,
    createdAt: d.createdAt.toISOString(),
  };
}

export async function listForMerchant(
  merchantId: string,
): Promise<DisputePublic[]> {
  const rows = await disputesRepo.listForMerchant(merchantId);
  return rows.map(toPublic);
}

export async function submitEvidence(input: {
  id: string;
  merchantId: string;
  text: string;
  url: string | null;
}): Promise<DisputePublic> {
  if (input.text.trim().length < 20) {
    throw new OrderError("Evidence must be at least 20 characters", 400);
  }
  const updated = await disputesRepo.submitEvidence({
    id: input.id,
    merchantId: input.merchantId,
    evidenceText: input.text.trim(),
    evidenceUrl: input.url,
  });
  if (!updated) throw new OrderError("Dispute not found or already submitted", 404);
  return toPublic(updated);
}

/**
 * Dev helper: simulate the issuing bank deciding the dispute. In production
 * this is driven by the provider's webhook (`payment.dispute.won` etc).
 */
export async function devResolve(input: {
  id: string;
  merchantId: string;
  outcome: "WON" | "LOST";
}): Promise<DisputePublic> {
  const dispute = await disputesRepo.findForMerchant(input.id, input.merchantId);
  if (!dispute) throw new OrderError("Dispute not found", 404);
  if (dispute.status !== "UNDER_REVIEW" && dispute.status !== "OPEN") {
    throw new OrderError("Dispute already resolved", 409);
  }
  const note =
    input.outcome === "WON"
      ? "Issuer accepted merchant evidence"
      : "Issuer ruled in customer's favour — chargeback";
  const updated = await disputesRepo.resolve({
    id: input.id,
    status: input.outcome,
    note,
  });
  if (!updated) throw new OrderError("Resolve failed", 500);
  return toPublic(updated);
}

/** Block refunds when there's an open dispute on the order. */
export async function assertNoOpenDispute(orderId: string): Promise<void> {
  const open = await disputesRepo.findOpenForOrder(orderId);
  if (open) {
    throw new OrderError(
      "Cannot refund — an open dispute exists on this order",
      409,
    );
  }
}

export async function openCount(merchantId: string): Promise<number> {
  return disputesRepo.countOpenForMerchant(merchantId);
}

/**
 * Manually create a dispute for an order. Useful for testing the full flow
 * without firing a provider webhook. Only available in dev.
 */
export async function createForTesting(input: {
  merchantId: string;
  orderId: string;
  reason: string;
}): Promise<DisputePublic> {
  const order = await ordersRepo.findForMerchant(input.orderId, input.merchantId);
  if (!order) throw new OrderError("Order not found", 404);
  if (order.status !== "SUCCESS") {
    throw new OrderError("Can only dispute a SUCCESS order", 409);
  }
  const created = await disputesRepo.create({
    merchantId: input.merchantId,
    orderId: order.id,
    providerDisputeId: null,
    reason: input.reason,
    amountPaise: Math.round(Number(order.amount) * 100),
    status: "OPEN",
    evidenceText: null,
    evidenceUrl: null,
    resolutionNote: null,
    deadlineAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    submittedAt: null,
    resolvedAt: null,
  });
  return toPublic(created);
}

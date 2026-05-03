import * as ordersRepo from "../repositories/orders";
import * as merchantsRepo from "../repositories/merchants";
import * as fraud from "./fraud";
import { providerRouter } from "../providers";
import { calculateFeePaise } from "./fees";
import { enqueueDelivery } from "./merchantWebhookDelivery";
import type { Order } from "@workspace/db";
import { decryptString } from "../utils/crypto";

const ORDER_TTL_MS = 15 * 60 * 1000; // 15 minutes
const KYC_REQUIRED_AMOUNT = 10_000; // ₹10,000+ requires APPROVED KYC

export class OrderError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface OrderPublic {
  id: string;
  orderId: string;
  txnId: string | null;
  providerOrderId: string | null;
  provider: string;
  receiverVpa: string | null;
  receiverLabel: string | null;
  paymentMethod: string | null;
  amount: number;
  feePaise: number;
  status: string;
  customerName: string | null;
  customerEmail: string | null;
  note: string | null;
  qrString: string | null;
  fraudFlag: boolean;
  fraudReason: string | null;
  refundStatus: string | null;
  refundAmount: number | null;
  settlementId: string | null;
  settledAt: string | null;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
  refundedAt: string | null;
}

export function toPublic(o: Order): OrderPublic {
  const upiParams = (() => {
    if (!o.qrString) return null;
    try {
      const query = o.qrString.startsWith("upi://pay?")
        ? o.qrString.slice("upi://pay?".length)
        : o.qrString;
      return new URLSearchParams(query);
    } catch {
      return null;
    }
  })();
  const receiverVpa = upiParams?.get("pa") ?? null;
  const receiverLabel = upiParams?.get("pn") ?? null;
  return {
    id: o.id,
    orderId: o.orderId,
    txnId: o.txnId,
    providerOrderId: o.providerOrderId,
    provider: o.provider,
    receiverVpa,
    receiverLabel,
    paymentMethod: o.paymentMethod,
    amount: Number(o.amount),
    feePaise: o.feePaise,
    status: o.status,
    customerName: o.customerName,
    customerEmail: o.customerEmail,
    note: o.note,
    qrString: o.qrString,
    fraudFlag: o.fraudFlag,
    fraudReason: o.fraudReason,
    refundStatus: o.refundStatus,
    refundAmount: o.refundAmount === null ? null : Number(o.refundAmount),
    settlementId: o.settlementId,
    settledAt: o.settledAt ? o.settledAt.toISOString() : null,
    createdAt: o.createdAt.toISOString(),
    expiresAt: o.expiresAt.toISOString(),
    paidAt: o.paidAt ? o.paidAt.toISOString() : null,
    refundedAt: o.refundedAt ? o.refundedAt.toISOString() : null,
  };
}

export async function createOrder(input: {
  merchantId: string;
  orderId: string;
  amount: number;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  note?: string | null;
  preferredProvider?: string | null;
}): Promise<{ order: OrderPublic; qrImage: string | null }> {
  if (!input.orderId.trim()) throw new OrderError("orderId is required");
  if (input.amount <= 0) throw new OrderError("amount must be positive");
  if (input.amount > 1_000_000) {
    throw new OrderError("amount exceeds per-order ceiling");
  }

  const merchant = await merchantsRepo.findById(input.merchantId);
  if (!merchant) throw new OrderError("Merchant not found", 404);

  // Block large-value orders for un-KYC'd merchants. Real aggregators do this.
  if (
    input.amount > KYC_REQUIRED_AMOUNT &&
    merchant.kycStatus !== "APPROVED" &&
    merchant.kycStatus !== "VERIFIED"
  ) {
    throw new OrderError(
      `KYC must be APPROVED to accept orders above ₹${KYC_REQUIRED_AMOUNT.toLocaleString("en-IN")}`,
      403,
    );
  }

  const fraudResult = await fraud.evaluate({
    merchantId: input.merchantId,
    amount: input.amount,
  });

  const providerInput = {
    orderId: input.orderId,
    amount: input.amount,
    businessName: merchant.businessName,
    customerName: input.customerName ?? null,
    customerEmail: input.customerEmail ?? null,
    customerPhone: input.customerPhone ?? null,
    merchantConfig: {
      merchantId: merchant.id,
      providerMerchantId: decryptString(merchant.providerMerchantId),
      providerAccount: decryptString(merchant.providerMerchantId) || decryptString(merchant.providerVpa),
      providerStoreId: decryptString(merchant.providerStoreId),
      providerTerminalId: decryptString(merchant.providerTerminalId),
      providerReference: decryptString(merchant.providerReference),
      providerVpa: decryptString(merchant.providerVpa),
    },
  };

  // Try preferred provider first if specified, else let router pick.
  let chosen;
  const preferredProvider = input.preferredProvider ?? merchant.preferredProvider;
  if (preferredProvider) {
    const p = providerRouter.get(preferredProvider);
    if (!p) throw new OrderError("Unknown provider", 400);
    try {
      const result = await p.createQR(providerInput);
      chosen = { provider: p.name, result, attempted: [p.name] };
    } catch (e) {
      throw new OrderError(
        e instanceof Error
          ? `${p.displayName} order creation failed: ${e.message}`
          : `${p.displayName} order creation failed`,
        502,
      );
    }
  } else {
    try {
      chosen = await providerRouter.createOrder(providerInput);
    } catch (e) {
      throw new OrderError(
        e instanceof Error ? e.message : "Failed to create payment QR",
        502,
      );
    }
  }

  let saved;
  try {
    saved = await ordersRepo.insertOrder({
      merchantId: input.merchantId,
      orderId: input.orderId.trim(),
      txnId: chosen.result.txnId,
      providerOrderId: chosen.result.providerOrderId,
      paymentMethod: null,
      provider: chosen.provider,
      amount: input.amount.toFixed(2),
      feePaise: 0,
      status: "PENDING",
      customerName: input.customerName?.trim() || null,
      customerEmail: input.customerEmail?.trim().toLowerCase() || null,
      note: input.note?.trim() || null,
      qrString: chosen.result.qrString ?? null,
      fraudFlag: fraudResult.flag,
      fraudReason: fraudResult.reason,
      refundStatus: null,
      refundAmount: null,
      refundedAt: null,
      settlementId: null,
      settledAt: null,
      expiresAt: new Date(Date.now() + ORDER_TTL_MS),
      paidAt: null,
    });
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code === "23505") {
      throw new OrderError("Duplicate orderId for this merchant", 409);
    }
    throw e;
  }

  return {
    order: toPublic(saved),
    qrImage: chosen.result.qrImage ?? null,
  };
}

export async function getById(id: string): Promise<OrderPublic | null> {
  const o = await ordersRepo.findByPublicId(id);
  return o ? toPublic(o) : null;
}

export async function getForMerchant(
  id: string,
  merchantId: string,
): Promise<OrderPublic | null> {
  const o = await ordersRepo.findForMerchant(id, merchantId);
  return o ? toPublic(o) : null;
}

export async function listForMerchant(f: ordersRepo.OrderListFilters): Promise<OrderPublic[]> {
  const rows = await ordersRepo.listForMerchant(f);
  return rows.map(toPublic);
}

export async function exportForMerchant(f: ordersRepo.OrderListFilters): Promise<OrderPublic[]> {
  const rows = await ordersRepo.exportForMerchant(f);
  return rows.map(toPublic);
}

export async function simulatePayment(input: {
  txnId: string;
  status: "SUCCESS" | "FAILED";
  paymentMethod?: string;
}): Promise<OrderPublic> {
  const order = await ordersRepo.findByTxn(input.txnId);
  if (!order) throw new OrderError("Order not found", 404);
  if (order.status !== "PENDING") {
    throw new OrderError(`Order already ${order.status}`, 409);
  }
  let updated;
  if (input.status === "SUCCESS") {
    const fee = calculateFeePaise(Number(order.amount));
    updated = await ordersRepo.markPaid({
      orderId: order.id,
      txnId: input.txnId,
      paymentMethod: input.paymentMethod ?? "UPI",
      feePaise: fee,
    });
  } else {
    updated = await ordersRepo.markFailed(order.id);
  }
  if (!updated) throw new OrderError("Failed to update order", 500);
  await enqueueDelivery({
    order: updated,
    event: input.status === "SUCCESS" ? "payment.success" : "payment.failed",
  });
  return toPublic(updated);
}

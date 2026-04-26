import * as ordersRepo from "../repositories/orders";
import * as merchantsRepo from "../repositories/merchants";
import * as fraud from "./fraud";
import { defaultProviderName, getProvider } from "../providers";
import { enqueueDelivery } from "./merchantWebhookDelivery";
import type { Order } from "@workspace/db";

const ORDER_TTL_MS = 15 * 60 * 1000; // 15 minutes

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
  provider: string;
  amount: number;
  status: string;
  customerName: string | null;
  customerEmail: string | null;
  note: string | null;
  qrString: string | null;
  fraudFlag: boolean;
  fraudReason: string | null;
  refundStatus: string | null;
  refundAmount: number | null;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
  refundedAt: string | null;
}

export function toPublic(o: Order): OrderPublic {
  return {
    id: o.id,
    orderId: o.orderId,
    txnId: o.txnId,
    provider: o.provider,
    amount: Number(o.amount),
    status: o.status,
    customerName: o.customerName,
    customerEmail: o.customerEmail,
    note: o.note,
    qrString: o.qrString,
    fraudFlag: o.fraudFlag,
    fraudReason: o.fraudReason,
    refundStatus: o.refundStatus,
    refundAmount: o.refundAmount === null ? null : Number(o.refundAmount),
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
  note?: string | null;
}): Promise<{ order: OrderPublic; qrImage: string }> {
  if (!input.orderId.trim()) throw new OrderError("orderId is required");
  if (input.amount <= 0) throw new OrderError("amount must be positive");
  if (input.amount > 1_000_000) {
    throw new OrderError("amount exceeds per-order ceiling");
  }

  const merchant = await merchantsRepo.findById(input.merchantId);
  if (!merchant) throw new OrderError("Merchant not found", 404);

  const provider = getProvider(defaultProviderName);
  const fraudResult = await fraud.evaluate({
    merchantId: input.merchantId,
    amount: input.amount,
  });

  let qr;
  try {
    qr = await provider.createQR({
      orderId: input.orderId,
      amount: input.amount,
      businessName: merchant.businessName,
    });
  } catch (e) {
    throw new OrderError("Failed to create payment QR", 502);
  }

  let saved;
  try {
    saved = await ordersRepo.insertOrder({
      merchantId: input.merchantId,
      orderId: input.orderId.trim(),
      txnId: qr.txnId,
      provider: defaultProviderName,
      amount: input.amount.toFixed(2),
      status: "PENDING",
      customerName: input.customerName?.trim() || null,
      customerEmail: input.customerEmail?.trim().toLowerCase() || null,
      note: input.note?.trim() || null,
      qrString: qr.qrString,
      fraudFlag: fraudResult.flag,
      fraudReason: fraudResult.reason,
      refundStatus: null,
      refundAmount: null,
      refundedAt: null,
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

  return { order: toPublic(saved), qrImage: qr.qrImage };
}

export async function getById(id: string): Promise<OrderPublic | null> {
  const o = await ordersRepo.findById(id);
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
}): Promise<OrderPublic> {
  const order = await ordersRepo.findByTxn(input.txnId);
  if (!order) throw new OrderError("Order not found", 404);
  if (order.status !== "PENDING") {
    throw new OrderError(`Order already ${order.status}`, 409);
  }
  const updated =
    input.status === "SUCCESS"
      ? await ordersRepo.markPaid({ orderId: order.id, txnId: input.txnId })
      : await ordersRepo.markFailed(order.id);
  if (!updated) throw new OrderError("Failed to update order", 500);
  await enqueueDelivery({
    order: updated,
    event: input.status === "SUCCESS" ? "payment.success" : "payment.failed",
  });
  return toPublic(updated);
}

import * as ordersRepo from "../repositories/orders";
import { getProvider } from "../providers";
import { toPublic, type OrderPublic, OrderError } from "./orders";
import { enqueueDelivery } from "./merchantWebhookDelivery";
import { assertNoOpenDispute } from "./disputes";

export async function refundOrder(input: {
  merchantId: string;
  orderId: string;
  amount?: number;
  reason?: string;
}): Promise<{ order: OrderPublic; status: string }> {
  const order = await ordersRepo.findForMerchant(input.orderId, input.merchantId);
  if (!order) throw new OrderError("Order not found", 404);
  if (order.status !== "SUCCESS") {
    throw new OrderError(`Cannot refund order with status ${order.status}`, 409);
  }
  if (order.refundStatus === "SUCCESS") {
    throw new OrderError("Order already refunded", 409);
  }
  await assertNoOpenDispute(order.id);

  const total = Number(order.amount);
  const amount = input.amount ?? total;
  if (amount <= 0 || amount > total) {
    throw new OrderError("Invalid refund amount", 400);
  }
  if (!order.txnId) throw new OrderError("Order missing txnId", 500);

  const provider = getProvider(order.provider);
  const result = await provider.refund(order.txnId, amount);
  const refundStatus = result.ok ? result.status : "FAILED";

  const updated = await ordersRepo.markRefund({
    orderId: order.id,
    status: refundStatus,
    amount: amount.toFixed(2),
  });
  if (!updated) throw new OrderError("Failed to update refund", 500);
  if (refundStatus === "SUCCESS") {
    await enqueueDelivery({ order: updated, event: "payment.refunded" });
  }
  return { order: toPublic(updated), status: refundStatus };
}

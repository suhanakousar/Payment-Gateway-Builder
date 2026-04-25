import { Router, type IRouter } from "express";
import {
  CreateOrderBody,
  ListOrdersQueryParams,
  GetOrderParams,
  SimulatePaymentBody,
  SimulatePaymentParams,
} from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import {
  createOrderForMerchant,
  getOrderForSimulation,
  getPublicOrder,
  listOrdersForMerchant,
} from "../services/orderService";
import { processWebhook } from "../services/webhookService";

const router: IRouter = Router();

router.get("/orders", requireAuth, async (req, res) => {
  const parsed = ListOrdersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query", details: parsed.error });
    return;
  }
  const limit = parsed.data.limit ?? 50;
  const merchantId = req.merchant!.merchantId;
  const orders = await listOrdersForMerchant(merchantId, limit);
  res.json(orders);
});

router.post("/orders/create", requireAuth, async (req, res) => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error });
    return;
  }
  try {
    const result = await createOrderForMerchant({
      merchantId: req.merchant!.merchantId,
      orderId: parsed.data.orderId,
      amount: parsed.data.amount,
      customerName: parsed.data.customerName,
      customerEmail: parsed.data.customerEmail,
      note: parsed.data.note,
    });
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to create order");
    res.status(500).json({ error: "Failed to create order" });
  }
});

router.get("/orders/:orderId", async (req, res) => {
  const parsed = GetOrderParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const order = await getPublicOrder(parsed.data.orderId);
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  res.json(order);
});

router.post("/orders/:orderId/simulate", async (req, res) => {
  const params = SimulatePaymentParams.safeParse(req.params);
  const body = SimulatePaymentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const order = await getOrderForSimulation(params.data.orderId);
  if (!order || !order.txnId) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const result = await processWebhook({
    txnId: order.txnId,
    status: body.data.outcome,
  });
  res.json({ ok: result.status !== "unknown_txn", status: result.status });
});

export default router;

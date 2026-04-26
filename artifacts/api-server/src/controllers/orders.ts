import type { Request, Response } from "express";
import {
  CreateOrderBody,
  ListOrdersQueryParams,
  ExportOrdersQueryParams,
  SimulatePaymentBody,
} from "@workspace/api-zod";
import * as ordersService from "../services/orders";
import { rowsToCsv } from "../utils/csv";

function handleError(res: Response, e: unknown): void {
  if (e instanceof ordersService.OrderError) {
    res.status(e.status).json({ error: e.message });
    return;
  }
  res.status(500).json({ error: "Internal server error" });
}

export async function create(req: Request, res: Response): Promise<void> {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  try {
    const { order, qrImage } = await ordersService.createOrder({
      merchantId: req.merchant!.id,
      orderId: parsed.data.orderId,
      amount: parsed.data.amount,
      customerName: parsed.data.customerName ?? null,
      customerEmail: parsed.data.customerEmail ?? null,
      note: parsed.data.note ?? null,
    });
    res.status(201).json({ order, qrImage });
  } catch (e) {
    handleError(res, e);
  }
}

export async function list(req: Request, res: Response): Promise<void> {
  const parsed = ListOrdersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });
    return;
  }
  const { status, search, from, to, limit } = parsed.data;
  const orders = await ordersService.listForMerchant({
    merchantId: req.merchant!.id,
    status,
    search,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
    limit,
  });
  res.json(orders);
}

export async function exportCsv(req: Request, res: Response): Promise<void> {
  const parsed = ExportOrdersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });
    return;
  }
  const orders = await ordersService.exportForMerchant({
    merchantId: req.merchant!.id,
    status: parsed.data.status,
    search: parsed.data.search,
    from: parsed.data.from ? new Date(parsed.data.from) : undefined,
    to: parsed.data.to ? new Date(parsed.data.to) : undefined,
  });
  const csv = rowsToCsv(
    orders.map((o) => ({
      orderId: o.orderId,
      txnId: o.txnId ?? "",
      amount: o.amount,
      status: o.status,
      provider: o.provider,
      customerName: o.customerName ?? "",
      customerEmail: o.customerEmail ?? "",
      note: o.note ?? "",
      fraudFlag: o.fraudFlag ? "yes" : "no",
      fraudReason: o.fraudReason ?? "",
      refundStatus: o.refundStatus ?? "",
      refundAmount: o.refundAmount ?? "",
      createdAt: o.createdAt,
      paidAt: o.paidAt ?? "",
    })),
    [
      { key: "orderId", header: "Order ID" },
      { key: "txnId", header: "Txn ID" },
      { key: "amount", header: "Amount" },
      { key: "status", header: "Status" },
      { key: "provider", header: "Provider" },
      { key: "customerName", header: "Customer Name" },
      { key: "customerEmail", header: "Customer Email" },
      { key: "note", header: "Note" },
      { key: "fraudFlag", header: "Fraud Flag" },
      { key: "fraudReason", header: "Fraud Reason" },
      { key: "refundStatus", header: "Refund Status" },
      { key: "refundAmount", header: "Refund Amount" },
      { key: "createdAt", header: "Created At" },
      { key: "paidAt", header: "Paid At" },
    ],
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="paylite-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
  );
  res.send(csv);
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const id = String(req.params["id"] ?? "");
  if (!id) {
    res.status(400).json({ error: "id required" });
    return;
  }
  // Public: anyone with the order ID can view its status (used by checkout page).
  const order = await ordersService.getById(id);
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  res.json(order);
}

export async function simulate(req: Request, res: Response): Promise<void> {
  if (process.env["NODE_ENV"] === "production") {
    res.status(403).json({ error: "Simulation not allowed in production" });
    return;
  }
  const txnId = String(req.params["txnId"] ?? "");
  if (!txnId) {
    res.status(400).json({ error: "txnId required" });
    return;
  }
  const parsed = SimulatePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  try {
    const order = await ordersService.simulatePayment({
      txnId,
      status: parsed.data.outcome,
    });
    res.json({ ok: true, status: order.status });
  } catch (e) {
    if (e instanceof ordersService.OrderError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
}

import type { Request, Response } from "express";
import { RefundOrderBody } from "@workspace/api-zod";
import * as refundService from "../services/refund";
import { OrderError } from "../services/orders";

export async function refund(req: Request, res: Response): Promise<void> {
  const id = String(req.params["id"] ?? "");
  if (!id) {
    res.status(400).json({ error: "id required" });
    return;
  }
  const parsed = RefundOrderBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  try {
    const result = await refundService.refundOrder({
      merchantId: req.merchant!.id,
      orderId: id,
      amount: parsed.data.amount,
    });
    res.json(result);
  } catch (e) {
    if (e instanceof OrderError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
}

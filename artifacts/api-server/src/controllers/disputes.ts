import type { Request, Response } from "express";
import * as service from "../services/disputes";
import { OrderError } from "../services/orders";

export async function list(req: Request, res: Response): Promise<void> {
  const items = await service.listForMerchant(req.merchant!.id);
  res.json(items);
}

export async function submitEvidence(req: Request, res: Response): Promise<void> {
  const body = req.body as { text?: string; url?: string };
  if (!body.text) {
    res.status(400).json({ error: "text required" });
    return;
  }
  try {
    const dispute = await service.submitEvidence({
      id: String(req.params["id"]),
      merchantId: req.merchant!.id,
      text: body.text,
      url: body.url ?? null,
    });
    res.json(dispute);
  } catch (e) {
    if (e instanceof OrderError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    res.status(500).json({ error: "Submission failed" });
  }
}

/** Dev-only: simulate the bank deciding the dispute. */
export async function devResolve(req: Request, res: Response): Promise<void> {
  const body = req.body as { outcome?: "WON" | "LOST" };
  if (body.outcome !== "WON" && body.outcome !== "LOST") {
    res.status(400).json({ error: "outcome must be WON or LOST" });
    return;
  }
  const outcome: "WON" | "LOST" = body.outcome;
  try {
    const dispute = await service.devResolve({
      id: String(req.params["id"]),
      merchantId: req.merchant!.id,
      outcome,
    });
    res.json(dispute);
  } catch (e) {
    if (e instanceof OrderError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    res.status(500).json({ error: "Resolve failed" });
  }
}

/** Dev-only: create a dispute to test the merchant flow. */
export async function devCreate(req: Request, res: Response): Promise<void> {
  const body = req.body as { orderId?: string; reason?: string };
  if (!body.orderId || !body.reason) {
    res.status(400).json({ error: "orderId and reason required" });
    return;
  }
  try {
    const dispute = await service.createForTesting({
      merchantId: req.merchant!.id,
      orderId: body.orderId,
      reason: body.reason,
    });
    res.status(201).json(dispute);
  } catch (e) {
    if (e instanceof OrderError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    res.status(500).json({ error: "Create dispute failed" });
  }
}

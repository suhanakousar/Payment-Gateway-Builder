import type { Request, Response } from "express";
import * as service from "../services/settlement";

export async function list(req: Request, res: Response): Promise<void> {
  const items = await service.listForMerchant(req.merchant!.id);
  res.json(items);
}

export async function ledger(req: Request, res: Response): Promise<void> {
  const entries = await service.ledgerForMerchant(req.merchant!.id);
  res.json(entries);
}

/** Dev-only: trigger a settlement run for an arbitrary date. */
export async function runForDate(req: Request, res: Response): Promise<void> {
  const date = (req.query["date"] as string | undefined) ?? new Date().toISOString().slice(0, 10);
  const result = await service.runSettlementForDate(date);
  res.json({ ok: true, date, ...result });
}

/** Dev-only: simulate the bank confirming the payout. */
export async function markPaid(req: Request, res: Response): Promise<void> {
  const updated = await service.markPaid({ id: String(req.params["id"]) });
  if (!updated) {
    res.status(404).json({ error: "Settlement not found" });
    return;
  }
  res.json(updated);
}

import type { Request, Response } from "express";
import {
  CreateMerchantWebhookBody,
  ListWebhookLogsQueryParams,
} from "@workspace/api-zod";
import * as repo from "../repositories/merchantWebhooks";
import * as logsRepo from "../repositories/webhookLogs";
import { generateWebhookSecret, maskTail } from "../utils/crypto";
import { validateWebhookUrl } from "../utils/urlValidation";
import { sendTestPing } from "../services/merchantWebhookDelivery";

export async function list(req: Request, res: Response): Promise<void> {
  const rows = await repo.listForMerchant(req.merchant!.id);
  res.json(
    rows.map((r) => ({
      id: r.id,
      webhookUrl: r.webhookUrl,
      maskedSecret: maskTail(r.webhookSecret, 4),
      enabled: r.enabled,
      createdAt: r.createdAt.toISOString(),
    })),
  );
}

export async function create(req: Request, res: Response): Promise<void> {
  const parsed = CreateMerchantWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
    return;
  }
  const validation = validateWebhookUrl(parsed.data.webhookUrl);
  if (!validation.ok) {
    res.status(400).json({ error: validation.reason ?? "Invalid webhook URL" });
    return;
  }
  const secret = generateWebhookSecret();
  const row = await repo.insertWebhook({
    merchantId: req.merchant!.id,
    webhookUrl: parsed.data.webhookUrl,
    webhookSecret: secret,
  });
  res.status(201).json({
    id: row.id,
    webhookUrl: row.webhookUrl,
    webhookSecret: secret,
    maskedSecret: maskTail(secret, 4),
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
  });
}

export async function remove(req: Request, res: Response): Promise<void> {
  const id = String(req.params["id"] ?? "");
  if (!id) {
    res.status(400).json({ error: "id required" });
    return;
  }
  const ok = await repo.deleteWebhook(id, req.merchant!.id);
  if (!ok) {
    res.status(404).json({ error: "Webhook not found" });
    return;
  }
  res.json({ ok: true });
}

export async function test(req: Request, res: Response): Promise<void> {
  const id = String(req.params["id"] ?? "");
  if (!id) {
    res.status(400).json({ error: "id required" });
    return;
  }
  const result = await sendTestPing({
    webhookId: id,
    merchantId: req.merchant!.id,
  });
  res.json(result);
}

export async function logs(req: Request, res: Response): Promise<void> {
  const parsed = ListWebhookLogsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });
    return;
  }
  const rows = await logsRepo.listForMerchant({
    merchantId: req.merchant!.id,
    limit: parsed.data.limit,
  });
  res.json(
    rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      merchantWebhookId: r.merchantWebhookId,
      event: r.event,
      attempt: r.attempt,
      status: r.status,
      requestBody: r.requestBody,
      responseCode: r.responseCode,
      responseBody: r.responseBody,
      error: r.error,
      createdAt: r.createdAt.toISOString(),
    })),
  );
}

import type { Request, Response } from "express";
import * as service from "../services/providerWebhook";
import { logger } from "../utils/logger";

export async function receive(req: Request, res: Response): Promise<void> {
  // express.json({ verify }) populates rawBody on the request — see app.ts.
  const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
  if (!raw) {
    res.status(400).json({ error: "Missing raw body" });
    return;
  }
  const providerName =
    (req.query["provider"] as string | undefined) ??
    process.env["DEFAULT_PROVIDER"] ??
    "cashfree";

  logger.info(
    {
      provider: providerName,
      contentLength: raw.length,
      sig: req.headers["x-webhook-signature"] ?? req.headers["x-razorpay-signature"] ?? null,
    },
    "WEBHOOK RECEIVED",
  );

  // Hand the entire header set to the adapter — different providers use
  // different header names (x-razorpay-signature, x-webhook-signature, …).
  const headers: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
  }
  try {
    const result = await service.processProviderWebhook({
      rawBody: raw,
      headers,
      providerName,
    });
    logger.info(
      { provider: result.provider, deduped: result.deduped },
      "WEBHOOK PROCESSED",
    );
    res.json({ ok: true, deduped: result.deduped, provider: result.provider });
  } catch (e) {
    if (e instanceof service.WebhookError) {
      logger.warn({ err: e.message, provider: providerName }, "WEBHOOK REJECTED");
      res.status(e.status).json({ error: e.message });
      return;
    }
    logger.error({ err: e, provider: providerName }, "WEBHOOK ERROR");
    res.status(500).json({ error: "Internal server error" });
  }
}

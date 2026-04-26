import type { Request, Response } from "express";
import * as service from "../services/providerWebhook";

export async function receive(req: Request, res: Response): Promise<void> {
  // express.json({ verify }) populates rawBody on the request — see app.ts.
  const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
  if (!raw) {
    res.status(400).json({ error: "Missing raw body" });
    return;
  }
  const sigHeader = req.header("x-paylite-signature") ?? req.header("x-signature");
  try {
    const result = await service.processProviderWebhook({
      rawBody: raw,
      signature: sigHeader ?? undefined,
    });
    res.json({ ok: true, deduped: result.deduped });
  } catch (e) {
    if (e instanceof service.WebhookError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
}

import { Router, type IRouter, type Request } from "express";
import rateLimit from "express-rate-limit";
import { ProviderWebhookBody } from "@workspace/api-zod";
import { verifyWebhookSignature } from "../lib/paymentProvider";
import { processWebhook } from "../services/webhookService";

const router: IRouter = Router();

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/webhook", webhookLimiter, async (req, res) => {
  const signature =
    req.header("x-signature") ?? req.header("X-Signature") ?? "";
  // Use the raw request body (captured in app.ts via express.json verify)
  // so HMAC matches exactly what the sender signed.
  const raw =
    (req as Request & { rawBody?: Buffer }).rawBody ??
    Buffer.from(JSON.stringify(req.body ?? {}));

  if (!verifyWebhookSignature(raw, signature)) {
    res.status(401).json({ received: false, status: "invalid_signature" });
    return;
  }

  const parsed = ProviderWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ received: false, status: "invalid_body" });
    return;
  }

  const result = await processWebhook({
    txnId: parsed.data.txnId,
    status: parsed.data.status,
  });
  res.json({ received: true, status: result.status });
});

export default router;

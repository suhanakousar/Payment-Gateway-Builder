import { Router, type IRouter } from "express";
import { ProviderWebhookBody } from "@workspace/api-zod";
import { verifyWebhookSignature } from "../lib/paymentProvider";
import { processWebhook } from "../services/webhookService";

const router: IRouter = Router();

router.post("/webhook", async (req, res) => {
  const signature =
    req.header("x-signature") ?? req.header("X-Signature") ?? "";
  const rawText = JSON.stringify(req.body ?? {});
  if (!verifyWebhookSignature(rawText, signature)) {
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

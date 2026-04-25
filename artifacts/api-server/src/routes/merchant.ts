import { Router, type IRouter } from "express";
import { db, merchantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateKycBody } from "@workspace/api-zod";
import { requireAuth } from "../lib/auth";
import { serializeMerchant } from "./auth";

const router: IRouter = Router();

router.get("/merchant/me", requireAuth, async (req, res) => {
  const merchantId = req.merchant!.merchantId;
  const [m] = await db
    .select()
    .from(merchantsTable)
    .where(eq(merchantsTable.id, merchantId))
    .limit(1);
  if (!m) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(serializeMerchant(m));
});

router.put("/merchant/kyc", requireAuth, async (req, res) => {
  const parsed = UpdateKycBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error });
    return;
  }
  const merchantId = req.merchant!.merchantId;
  const [updated] = await db
    .update(merchantsTable)
    .set({
      pan: parsed.data.pan.toUpperCase(),
      bankAccount: parsed.data.bankAccount,
      ifsc: parsed.data.ifsc.toUpperCase(),
      kycStatus: "SUBMITTED",
    })
    .where(eq(merchantsTable.id, merchantId))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(serializeMerchant(updated));
});

export default router;

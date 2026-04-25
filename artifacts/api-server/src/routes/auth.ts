import { Router, type IRouter } from "express";
import { db, merchantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SignupBody, LoginBody } from "@workspace/api-zod";
import { hashPassword, comparePassword, signToken } from "../lib/auth";

const router: IRouter = Router();

function serializeMerchant(m: typeof merchantsTable.$inferSelect) {
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    businessName: m.businessName,
    pan: m.pan ?? null,
    bankAccount: m.bankAccount ?? null,
    ifsc: m.ifsc ?? null,
    kycStatus: m.kycStatus as "PENDING" | "SUBMITTED" | "VERIFIED",
    approved: m.approved,
    createdAt: m.createdAt.toISOString(),
  };
}

router.post("/auth/signup", async (req, res) => {
  const parsed = SignupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error });
    return;
  }
  const { name, email, password, businessName } = parsed.data;

  const existing = await db
    .select()
    .from(merchantsTable)
    .where(eq(merchantsTable.email, email.toLowerCase()))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const [created] = await db
    .insert(merchantsTable)
    .values({
      name,
      email: email.toLowerCase(),
      passwordHash,
      businessName,
    })
    .returning();

  if (!created) {
    res.status(500).json({ error: "Failed to create merchant" });
    return;
  }

  const token = signToken({ merchantId: created.id, email: created.email });
  res.json({ token, merchant: serializeMerchant(created) });
});

router.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error });
    return;
  }
  const { email, password } = parsed.data;

  const [m] = await db
    .select()
    .from(merchantsTable)
    .where(eq(merchantsTable.email, email.toLowerCase()))
    .limit(1);
  if (!m) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const ok = await comparePassword(password, m.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const token = signToken({ merchantId: m.id, email: m.email });
  res.json({ token, merchant: serializeMerchant(m) });
});

export { serializeMerchant };
export default router;

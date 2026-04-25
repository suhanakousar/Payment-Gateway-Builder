import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { db, merchantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SignupBody, LoginBody } from "@workspace/api-zod";
import { hashPassword, comparePassword, signToken } from "../lib/auth";

const router: IRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many signup attempts. Please try again later." },
});

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

function isStrongEnoughPassword(pw: string): boolean {
  if (pw.length < 8) return false;
  // Require at least one letter and one digit (basic strength check).
  return /[A-Za-z]/.test(pw) && /\d/.test(pw);
}

router.post("/auth/signup", signupLimiter, async (req, res) => {
  const parsed = SignupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error });
    return;
  }
  const { name, email, password, businessName } = parsed.data;

  if (!isStrongEnoughPassword(password)) {
    res.status(400).json({
      error:
        "Password must be at least 8 characters and contain a letter and a number.",
    });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  const existing = await db
    .select()
    .from(merchantsTable)
    .where(eq(merchantsTable.email, normalizedEmail))
    .limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const [created] = await db
    .insert(merchantsTable)
    .values({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      businessName: businessName.trim(),
    })
    .returning();

  if (!created) {
    res.status(500).json({ error: "Failed to create merchant" });
    return;
  }

  const token = signToken({ merchantId: created.id, email: created.email });
  res.json({ token, merchant: serializeMerchant(created) });
});

router.post("/auth/login", authLimiter, async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error });
    return;
  }
  const { email, password } = parsed.data;

  const [m] = await db
    .select()
    .from(merchantsTable)
    .where(eq(merchantsTable.email, email.toLowerCase().trim()))
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

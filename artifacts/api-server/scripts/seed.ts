import { db, merchantsTable, ordersTable, pool } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const DEMO_EMAIL = "demo@paylite.in";
const DEMO_PASSWORD = "demo1234";

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const existing = await db
    .select()
    .from(merchantsTable)
    .where(eq(merchantsTable.email, DEMO_EMAIL))
    .limit(1);

  let merchantId: string;
  if (existing.length === 0) {
    const [created] = await db
      .insert(merchantsTable)
      .values({
        name: "Demo Merchant",
        email: DEMO_EMAIL,
        passwordHash,
        businessName: "Sundar Tea Stall",
        pan: "ABCDE1234F",
        bankAccount: "1234567890",
        bankAccountHolderName: "Sundar Singh",
        ifsc: "HDFC0001234",
        kycStatus: "APPROVED",
        approved: true,
        // Sandbox vendor — lets the demo merchant create orders without the
        // real Cashfree onboarding loop. In production this is set by
        // ensureVendor() after KYC approval.
        providerMerchantId: "sandbox_v_demo",
        providerStatus: "ACTIVE",
        providerVpa: "demo@upi",
      })
      .returning();
    if (!created) throw new Error("Failed to seed demo merchant");
    merchantId = created.id;
    console.log(`Created demo merchant ${created.email}`);
  } else {
    const [updated] = await db
      .update(merchantsTable)
      .set({
        passwordHash,
        bankAccountHolderName: "Sundar Singh",
        providerMerchantId: existing[0]!.providerMerchantId ?? "sandbox_v_demo",
        providerStatus:
          existing[0]!.providerStatus === "ACTIVE" ? "ACTIVE" : "ACTIVE",
        providerVpa: existing[0]!.providerVpa ?? "demo@upi",
      })
      .where(eq(merchantsTable.email, DEMO_EMAIL))
      .returning();
    merchantId = updated!.id;
    console.log(`Refreshed demo merchant for ${DEMO_EMAIL}`);
  }

  const orderCount = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(eq(ordersTable.merchantId, merchantId))
    .limit(1);

  if (orderCount.length === 0) {
    const now = Date.now();
    const samples = [
      { offsetDays: 1, amount: 250, status: "SUCCESS" as const, customer: "Asha Verma" },
      { offsetDays: 2, amount: 540, status: "SUCCESS" as const, customer: "Rohit Mehra" },
      { offsetDays: 3, amount: 120, status: "FAILED" as const, customer: "Neha Kapoor" },
      { offsetDays: 5, amount: 890, status: "SUCCESS" as const, customer: "Vikas Singh" },
    ];

    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]!;
      const created = new Date(now - s.offsetDays * 24 * 60 * 60 * 1000);
      const expires = new Date(created.getTime() + 5 * 60 * 1000);
      await db.insert(ordersTable).values({
        merchantId,
        orderId: `SEED-${i + 1}-${Math.random().toString(36).slice(2, 8)}`,
        txnId: `SEEDTXN_${i + 1}_${Math.random().toString(36).slice(2, 8)}`,
        amount: s.amount.toFixed(2),
        status: s.status,
        customerName: s.customer,
        customerEmail: null,
        note: "Seed order",
        qrString: "upi://pay?pa=paylite@upi&pn=Sundar%20Tea%20Stall",
        createdAt: created,
        expiresAt: expires,
        paidAt: s.status === "SUCCESS" ? created : null,
      });
    }
    console.log(`Inserted ${samples.length} demo orders`);
  } else {
    console.log("Demo orders already present, skipping order seed");
  }
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });

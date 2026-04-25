import { db } from "@workspace/db/client";
import { merchantsTable, type Merchant } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function findByEmail(email: string): Promise<Merchant | null> {
  const rows = await db
    .select()
    .from(merchantsTable)
    .where(eq(merchantsTable.email, email))
    .limit(1);
  return rows[0] ?? null;
}

export async function findById(id: string): Promise<Merchant | null> {
  const rows = await db
    .select()
    .from(merchantsTable)
    .where(eq(merchantsTable.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertMerchant(values: {
  name: string;
  email: string;
  passwordHash: string;
  businessName: string;
}): Promise<Merchant> {
  const [row] = await db
    .insert(merchantsTable)
    .values({ ...values, kycStatus: "PENDING", approved: false })
    .returning();
  return row!;
}

export async function updateKyc(
  id: string,
  patch: {
    pan: string | null;
    bankAccount: string | null;
    ifsc: string | null;
    kycStatus: string;
  },
): Promise<Merchant> {
  const [row] = await db
    .update(merchantsTable)
    .set(patch)
    .where(eq(merchantsTable.id, id))
    .returning();
  return row!;
}

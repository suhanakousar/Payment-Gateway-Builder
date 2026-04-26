import { db } from "@workspace/db";
import { merchantsTable, type Merchant } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";

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

export async function findByIds(ids: string[]): Promise<Merchant[]> {
  if (ids.length === 0) return [];
  return db.select().from(merchantsTable).where(inArray(merchantsTable.id, ids));
}

export async function insertMerchant(values: {
  name: string;
  email: string;
  passwordHash: string;
  businessName: string;
}): Promise<Merchant> {
  const [row] = await db
    .insert(merchantsTable)
    .values({ ...values, kycStatus: "NOT_STARTED", approved: false })
    .returning();
  return row!;
}

export async function updateKycFields(
  id: string,
  patch: Partial<{
    pan: string | null;
    bankAccount: string | null;
    ifsc: string | null;
    kycStatus: string;
    kycSubmittedAt: Date | null;
    kycReviewedAt: Date | null;
    kycRejectionReason: string | null;
    approved: boolean;
  }>,
): Promise<Merchant> {
  const [row] = await db
    .update(merchantsTable)
    .set(patch)
    .where(eq(merchantsTable.id, id))
    .returning();
  return row!;
}

/** Pick merchants whose KYC has been SUBMITTED for at least the given seconds. */
export async function findStaleSubmittedKyc(
  minAgeSec: number,
): Promise<Merchant[]> {
  return db
    .select()
    .from(merchantsTable)
    .where(
      and(
        eq(merchantsTable.kycStatus, "SUBMITTED"),
        sql`${merchantsTable.kycSubmittedAt} < now() - (${minAgeSec} || ' seconds')::interval`,
      ),
    );
}

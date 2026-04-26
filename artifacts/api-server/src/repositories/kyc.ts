import { db } from "@workspace/db";
import {
  kycDocumentsTable,
  type KycDocument,
  type InsertKycDocument,
} from "@workspace/db";
import { desc, eq } from "drizzle-orm";

export async function listForMerchant(
  merchantId: string,
): Promise<KycDocument[]> {
  return db
    .select()
    .from(kycDocumentsTable)
    .where(eq(kycDocumentsTable.merchantId, merchantId))
    .orderBy(desc(kycDocumentsTable.createdAt));
}

export async function insertDoc(values: InsertKycDocument): Promise<KycDocument> {
  const [row] = await db.insert(kycDocumentsTable).values(values).returning();
  return row!;
}

export async function deleteDoc(opts: {
  id: string;
  merchantId: string;
}): Promise<void> {
  await db
    .delete(kycDocumentsTable)
    .where(eq(kycDocumentsTable.id, opts.id));
}

import { db } from "@workspace/db";
import { merchantWebhooksTable, type MerchantWebhook } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export async function listEnabledForMerchant(
  merchantId: string,
): Promise<MerchantWebhook[]> {
  return db
    .select()
    .from(merchantWebhooksTable)
    .where(
      and(
        eq(merchantWebhooksTable.merchantId, merchantId),
        eq(merchantWebhooksTable.enabled, true),
      ),
    );
}

export async function listForMerchant(
  merchantId: string,
): Promise<MerchantWebhook[]> {
  return db
    .select()
    .from(merchantWebhooksTable)
    .where(eq(merchantWebhooksTable.merchantId, merchantId));
}

export async function findForMerchant(
  id: string,
  merchantId: string,
): Promise<MerchantWebhook | null> {
  const rows = await db
    .select()
    .from(merchantWebhooksTable)
    .where(
      and(
        eq(merchantWebhooksTable.id, id),
        eq(merchantWebhooksTable.merchantId, merchantId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function insertWebhook(values: {
  merchantId: string;
  webhookUrl: string;
  webhookSecret: string;
}): Promise<MerchantWebhook> {
  const [row] = await db
    .insert(merchantWebhooksTable)
    .values(values)
    .returning();
  return row!;
}

export async function deleteWebhook(
  id: string,
  merchantId: string,
): Promise<boolean> {
  const rows = await db
    .delete(merchantWebhooksTable)
    .where(
      and(
        eq(merchantWebhooksTable.id, id),
        eq(merchantWebhooksTable.merchantId, merchantId),
      ),
    )
    .returning({ id: merchantWebhooksTable.id });
  return rows.length > 0;
}

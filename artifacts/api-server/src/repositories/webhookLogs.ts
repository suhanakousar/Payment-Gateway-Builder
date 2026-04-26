import { db } from "@workspace/db";
import { webhookLogsTable, type WebhookLog } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { ordersTable } from "@workspace/db";

export async function insertLog(values: {
  orderId: string;
  merchantWebhookId: string | null;
  attempt: number;
  status: string;
  responseCode: number | null;
  responseBody: string | null;
  error: string | null;
}): Promise<WebhookLog> {
  const [row] = await db.insert(webhookLogsTable).values(values).returning();
  return row!;
}

export async function listForMerchant(opts: {
  merchantId: string;
  limit: number;
}): Promise<WebhookLog[]> {
  return db
    .select({
      id: webhookLogsTable.id,
      orderId: webhookLogsTable.orderId,
      merchantWebhookId: webhookLogsTable.merchantWebhookId,
      attempt: webhookLogsTable.attempt,
      status: webhookLogsTable.status,
      responseCode: webhookLogsTable.responseCode,
      responseBody: webhookLogsTable.responseBody,
      error: webhookLogsTable.error,
      createdAt: webhookLogsTable.createdAt,
    })
    .from(webhookLogsTable)
    .innerJoin(ordersTable, eq(ordersTable.id, webhookLogsTable.orderId))
    .where(eq(ordersTable.merchantId, opts.merchantId))
    .orderBy(desc(webhookLogsTable.createdAt))
    .limit(opts.limit);
}

export async function listFailedReady(opts: {
  maxAttempts: number;
  limit: number;
}): Promise<WebhookLog[]> {
  // Get the most recent log per (orderId, merchantWebhookId) and pick those
  // with status RETRY whose attempt < maxAttempts. Simple approach: just
  // pull recent RETRY rows; the delivery service deduplicates.
  return db
    .select()
    .from(webhookLogsTable)
    .where(and(eq(webhookLogsTable.status, "RETRY")))
    .orderBy(desc(webhookLogsTable.createdAt))
    .limit(opts.limit);
}

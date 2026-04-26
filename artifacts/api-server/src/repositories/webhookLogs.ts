import { db } from "@workspace/db";
import { webhookLogsTable, type WebhookLog } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { ordersTable } from "@workspace/db";

export async function insertLog(values: {
  orderId: string;
  merchantWebhookId: string | null;
  event: string;
  requestBody: string;
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
      event: webhookLogsTable.event,
      attempt: webhookLogsTable.attempt,
      status: webhookLogsTable.status,
      requestBody: webhookLogsTable.requestBody,
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
  return db
    .select()
    .from(webhookLogsTable)
    .where(and(eq(webhookLogsTable.status, "RETRY")))
    .orderBy(desc(webhookLogsTable.createdAt))
    .limit(opts.limit);
}

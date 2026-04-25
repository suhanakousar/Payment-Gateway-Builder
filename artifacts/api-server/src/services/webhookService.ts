import { db, ordersTable, webhookEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export interface WebhookResult {
  status: "applied" | "duplicate" | "unknown_txn";
}

export async function processWebhook(input: {
  txnId: string;
  status: "SUCCESS" | "FAILED";
}): Promise<WebhookResult> {
  // Idempotency: insert event row keyed on txnId; duplicate -> skip.
  const inserted = await db
    .insert(webhookEventsTable)
    .values({ txnId: input.txnId, status: input.status })
    .onConflictDoNothing({ target: webhookEventsTable.txnId })
    .returning();

  if (inserted.length === 0) {
    return { status: "duplicate" };
  }

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.txnId, input.txnId))
    .limit(1);

  if (!order) return { status: "unknown_txn" };

  // Don't override already-final statuses
  if (order.status === "SUCCESS" || order.status === "FAILED") {
    return { status: "duplicate" };
  }

  await db
    .update(ordersTable)
    .set({
      status: input.status,
      paidAt: input.status === "SUCCESS" ? new Date() : null,
    })
    .where(eq(ordersTable.id, order.id));

  return { status: "applied" };
}

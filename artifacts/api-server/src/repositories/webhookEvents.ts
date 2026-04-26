import { db } from "@workspace/db";
import { webhookEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function recordIfNew(opts: {
  txnId: string;
  status: string;
}): Promise<{ inserted: boolean }> {
  const existing = await db
    .select({ id: webhookEventsTable.id })
    .from(webhookEventsTable)
    .where(eq(webhookEventsTable.txnId, opts.txnId))
    .limit(1);
  if (existing.length > 0) return { inserted: false };
  await db
    .insert(webhookEventsTable)
    .values({ txnId: opts.txnId, status: opts.status })
    .onConflictDoNothing();
  return { inserted: true };
}

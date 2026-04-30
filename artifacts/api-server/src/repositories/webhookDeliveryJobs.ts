import { db } from "@workspace/db";
import { webhookDeliveryJobsTable, type WebhookDeliveryJob } from "@workspace/db";
import { and, asc, eq, inArray, lte, or } from "drizzle-orm";

export async function enqueueMany(
  values: Array<{
    orderId: string;
    merchantWebhookId: string;
    event: string;
    url: string;
    secret: string;
    payload: string;
    availableAt?: Date;
  }>,
): Promise<void> {
  if (values.length === 0) return;
  await db.insert(webhookDeliveryJobsTable).values(
    values.map((value) => ({
      ...value,
      availableAt: value.availableAt ?? new Date(),
      status: "PENDING",
      attempt: 0,
      lastError: null,
      lastResponseBody: null,
      lastResponseCode: null,
      lockedAt: null,
    })),
  );
}

export async function claimReady(limit: number): Promise<WebhookDeliveryJob[]> {
  const rows = await db
    .select()
    .from(webhookDeliveryJobsTable)
    .where(
      and(
        or(
          eq(webhookDeliveryJobsTable.status, "PENDING"),
          eq(webhookDeliveryJobsTable.status, "RETRY"),
        ),
        lte(webhookDeliveryJobsTable.availableAt, new Date()),
      ),
    )
    .orderBy(asc(webhookDeliveryJobsTable.availableAt), asc(webhookDeliveryJobsTable.createdAt))
    .limit(limit);

  const claimed: WebhookDeliveryJob[] = [];
  for (const row of rows) {
    const updated = await db
      .update(webhookDeliveryJobsTable)
      .set({
        status: "PROCESSING",
        lockedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(webhookDeliveryJobsTable.id, row.id),
          eq(webhookDeliveryJobsTable.status, row.status),
        ),
      )
      .returning();
    if (updated[0]) claimed.push(updated[0]);
  }
  return claimed;
}

export async function markSent(
  id: string,
  input: { attempt: number; responseCode: number | null; responseBody: string | null },
): Promise<void> {
  await db
    .update(webhookDeliveryJobsTable)
    .set({
      status: "SENT",
      attempt: input.attempt,
      lockedAt: null,
      lastError: null,
      lastResponseCode: input.responseCode,
      lastResponseBody: input.responseBody,
      updatedAt: new Date(),
    })
    .where(eq(webhookDeliveryJobsTable.id, id));
}

export async function markRetry(
  id: string,
  input: {
    attempt: number;
    availableAt: Date;
    responseCode: number | null;
    responseBody: string | null;
    error: string | null;
  },
): Promise<void> {
  await db
    .update(webhookDeliveryJobsTable)
    .set({
      status: "RETRY",
      attempt: input.attempt,
      availableAt: input.availableAt,
      lockedAt: null,
      lastError: input.error,
      lastResponseCode: input.responseCode,
      lastResponseBody: input.responseBody,
      updatedAt: new Date(),
    })
    .where(eq(webhookDeliveryJobsTable.id, id));
}

export async function markFailed(
  id: string,
  input: {
    attempt: number;
    responseCode: number | null;
    responseBody: string | null;
    error: string | null;
  },
): Promise<void> {
  await db
    .update(webhookDeliveryJobsTable)
    .set({
      status: "FAILED",
      attempt: input.attempt,
      lockedAt: null,
      lastError: input.error,
      lastResponseCode: input.responseCode,
      lastResponseBody: input.responseBody,
      updatedAt: new Date(),
    })
    .where(eq(webhookDeliveryJobsTable.id, id));
}

export async function releaseStaleLocks(olderThanMs: number): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanMs);
  await db
    .update(webhookDeliveryJobsTable)
    .set({
      status: "RETRY",
      lockedAt: null,
      availableAt: new Date(),
      updatedAt: new Date(),
      lastError: "Worker lock expired",
    })
    .where(
      and(
        eq(webhookDeliveryJobsTable.status, "PROCESSING"),
        lte(webhookDeliveryJobsTable.lockedAt, cutoff),
      ),
    );
}

export async function deleteForWebhook(webhookId: string): Promise<void> {
  await db
    .delete(webhookDeliveryJobsTable)
    .where(
      inArray(webhookDeliveryJobsTable.merchantWebhookId, [webhookId]),
    );
}

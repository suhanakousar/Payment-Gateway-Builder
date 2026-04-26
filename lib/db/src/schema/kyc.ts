import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { merchantsTable } from "./merchants";

/**
 * Document uploaded during KYC. We do not store the file bytes — only the
 * reference (filename + size + mime + opaque URL). In a real system this
 * would point at an S3/object-storage location; in the demo a synthetic URL
 * is stored.
 */
export const kycDocumentsTable = pgTable(
  "kyc_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchantsTable.id, { onDelete: "cascade" }),
    docType: text("doc_type").notNull(), // PAN | AADHAAR | CHEQUE | GST | OTHER
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageUrl: text("storage_url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("kyc_documents_merchant_idx").on(t.merchantId)],
);

export const insertKycDocumentSchema = createInsertSchema(kycDocumentsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertKycDocument = z.infer<typeof insertKycDocumentSchema>;
export type KycDocument = typeof kycDocumentsTable.$inferSelect;

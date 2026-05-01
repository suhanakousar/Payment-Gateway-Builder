import * as merchantsRepo from "../repositories/merchants";
import * as kycRepo from "../repositories/kyc";
import { OrderError } from "./orders";
import { ensureVendor } from "./vendor";
import { logger } from "../utils/logger";
import type { KycDocument } from "@workspace/db";

const ALLOWED_DOC_TYPES = ["PAN", "AADHAAR", "CHEQUE", "GST", "OTHER"] as const;
const MAX_DOC_BYTES = 2 * 1024 * 1024; // 2 MB
const AUTO_APPROVE_AFTER_SEC = 5; // dev only

export interface KycDocPublic {
  id: string;
  docType: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageUrl: string;
  createdAt: string;
}

export function toPublicDoc(d: KycDocument): KycDocPublic {
  return {
    id: d.id,
    docType: d.docType,
    filename: d.filename,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    storageUrl: d.storageUrl,
    createdAt: d.createdAt.toISOString(),
  };
}

export async function listDocs(merchantId: string): Promise<KycDocPublic[]> {
  const docs = await kycRepo.listForMerchant(merchantId);
  return docs.map(toPublicDoc);
}

/**
 * Accepts a "data URI" (data:mime;base64,...) — there's no real object store
 * wired up here yet, so we synthesise a deterministic URL from a hash. The
 * data is discarded; only metadata is persisted, which is what a real S3
 * upload pipeline would store too.
 */
export async function uploadDoc(input: {
  merchantId: string;
  docType: string;
  filename: string;
  dataUri: string;
}): Promise<KycDocPublic> {
  if (!ALLOWED_DOC_TYPES.includes(input.docType as (typeof ALLOWED_DOC_TYPES)[number])) {
    throw new OrderError(`Unsupported docType: ${input.docType}`, 400);
  }
  const m = /^data:([^;]+);base64,(.+)$/.exec(input.dataUri);
  if (!m) throw new OrderError("Invalid data URI", 400);
  const mime = m[1]!;
  const b64 = m[2]!;
  const sizeBytes = Math.floor((b64.length * 3) / 4);
  if (sizeBytes > MAX_DOC_BYTES) {
    throw new OrderError(
      `File too large (${(sizeBytes / 1024 / 1024).toFixed(1)} MB > 2 MB)`,
      400,
    );
  }
  // Synthetic storage URL — in real life this is what the S3 SDK would return.
  const idHash = Buffer.from(b64.slice(0, 32)).toString("hex").slice(0, 16);
  const storageUrl = `https://storage.paylite.in/kyc/${input.merchantId}/${idHash}/${encodeURIComponent(input.filename)}`;
  const doc = await kycRepo.insertDoc({
    merchantId: input.merchantId,
    docType: input.docType,
    filename: input.filename.slice(0, 200),
    mimeType: mime,
    sizeBytes,
    storageUrl,
  });
  return toPublicDoc(doc);
}

export async function deleteDoc(opts: {
  id: string;
  merchantId: string;
}): Promise<void> {
  await kycRepo.deleteDoc(opts);
}

/**
 * Move merchant from SUBMITTED → UNDER_REVIEW. In a real product this is
 * triggered when the compliance team picks up the application.
 */
export async function moveToReview(merchantId: string): Promise<void> {
  await merchantsRepo.updateKycFields(merchantId, {
    kycStatus: "UNDER_REVIEW",
  });
}

/**
 * Auto-approval cron used in dev to keep the demo flowing. Looks for
 * SUBMITTED merchants who have at least one doc and have been waiting more
 * than AUTO_APPROVE_AFTER_SEC seconds.
 */
export async function autoApprovePendingKyc(): Promise<number> {
  const candidates = await merchantsRepo.findStaleSubmittedKyc(
    AUTO_APPROVE_AFTER_SEC,
  );
  let approved = 0;
  for (const m of candidates) {
    const docs = await kycRepo.listForMerchant(m.id);
    if (docs.length === 0) continue;
    if (!m.bankAccount || !m.ifsc || !m.bankAccountHolderName || !m.pan) {
      // Don't auto-approve until the merchant has provided bank details +
      // PAN — otherwise vendor registration would fail downstream.
      continue;
    }
    await merchantsRepo.updateKycFields(m.id, {
      kycStatus: "APPROVED",
      kycReviewedAt: new Date(),
      approved: true,
      kycRejectionReason: null,
    });
    approved++;
    // Best-effort: register the merchant as a vendor on the provider so funds
    // can be routed to their bank. If this fails (network, validation), the
    // periodic vendor-sync cron retries on the next tick.
    try {
      await ensureVendor(m.id);
    } catch (e) {
      logger.warn(
        { err: e, merchantId: m.id },
        "[kyc] vendor registration failed after auto-approve",
      );
    }
  }
  return approved;
}

export async function reject(opts: {
  merchantId: string;
  reason: string;
}): Promise<void> {
  await merchantsRepo.updateKycFields(opts.merchantId, {
    kycStatus: "REJECTED",
    kycReviewedAt: new Date(),
    kycRejectionReason: opts.reason,
    approved: false,
  });
}

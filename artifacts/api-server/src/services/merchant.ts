import * as merchantsRepo from "../repositories/merchants";
import {
  encryptString,
  decryptString,
  maskPan,
  maskBankAccount,
} from "../utils/crypto";
import type { Merchant } from "@workspace/db";

export interface MerchantPublic {
  id: string;
  name: string;
  email: string;
  businessName: string;
  preferredProvider: string;
  providerMerchantId: string | null;
  providerStoreId: string | null;
  providerTerminalId: string | null;
  providerReference: string | null;
  providerVpa: string | null;
  providerStatus: string;
  pan: string | null;
  bankAccount: string | null;
  ifsc: string | null;
  kycStatus: string;
  kycSubmittedAt: string | null;
  kycReviewedAt: string | null;
  kycRejectionReason: string | null;
  approved: boolean;
  createdAt: string;
}

export function toPublic(m: Merchant, opts: { reveal?: boolean } = {}): MerchantPublic {
  const pan = decryptString(m.pan);
  const bank = decryptString(m.bankAccount);
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    businessName: m.businessName,
    preferredProvider: m.preferredProvider,
    providerMerchantId: decryptString(m.providerMerchantId),
    providerStoreId: decryptString(m.providerStoreId),
    providerTerminalId: decryptString(m.providerTerminalId),
    providerReference: decryptString(m.providerReference),
    providerVpa: decryptString(m.providerVpa),
    providerStatus: m.providerStatus,
    pan: opts.reveal ? pan : maskPan(pan),
    bankAccount: opts.reveal ? bank : maskBankAccount(bank),
    ifsc: m.ifsc,
    kycStatus: m.kycStatus,
    kycSubmittedAt: m.kycSubmittedAt ? m.kycSubmittedAt.toISOString() : null,
    kycReviewedAt: m.kycReviewedAt ? m.kycReviewedAt.toISOString() : null,
    kycRejectionReason: m.kycRejectionReason,
    approved: m.approved,
    createdAt: m.createdAt.toISOString(),
  };
}

export async function getById(id: string): Promise<MerchantPublic | null> {
  const m = await merchantsRepo.findById(id);
  return m ? toPublic(m) : null;
}

/**
 * Save raw KYC fields. Status is moved to "SUBMITTED" — the actual review
 * happens via the KYC service (auto-approves in dev after a short delay).
 */
export async function saveKycDetails(
  id: string,
  input: { pan: string; bankAccount: string; ifsc: string },
): Promise<MerchantPublic | null> {
  const ifsc = input.ifsc.toUpperCase();
  const updated = await merchantsRepo.updateKycFields(id, {
    pan: encryptString(input.pan.toUpperCase()),
    bankAccount: encryptString(input.bankAccount),
    ifsc,
    kycStatus: "SUBMITTED",
    kycSubmittedAt: new Date(),
    kycRejectionReason: null,
  });
  return updated ? toPublic(updated) : null;
}

export async function saveProviderConfig(
  id: string,
  input: {
    preferredProvider: string;
    providerMerchantId?: string | null;
    providerStoreId?: string | null;
    providerTerminalId?: string | null;
    providerReference?: string | null;
    providerVpa?: string | null;
    providerStatus?: string;
  },
): Promise<MerchantPublic | null> {
  const updated = await merchantsRepo.updateProviderFields(id, {
    preferredProvider: input.preferredProvider,
    providerMerchantId: encryptString(input.providerMerchantId?.trim() || null),
    providerStoreId: encryptString(input.providerStoreId?.trim() || null),
    providerTerminalId: encryptString(input.providerTerminalId?.trim() || null),
    providerReference: encryptString(input.providerReference?.trim() || null),
    providerVpa: encryptString(input.providerVpa?.trim().toLowerCase() || null),
    providerStatus: input.providerStatus ?? "ACTIVE",
  });
  return updated ? toPublic(updated) : null;
}

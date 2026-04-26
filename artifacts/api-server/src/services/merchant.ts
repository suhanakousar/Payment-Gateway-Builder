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
  pan: string | null;
  bankAccount: string | null;
  ifsc: string | null;
  kycStatus: string;
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
    pan: opts.reveal ? pan : maskPan(pan),
    bankAccount: opts.reveal ? bank : maskBankAccount(bank),
    ifsc: m.ifsc,
    kycStatus: m.kycStatus,
    approved: m.approved,
    createdAt: m.createdAt.toISOString(),
  };
}

export async function getById(id: string): Promise<MerchantPublic | null> {
  const m = await merchantsRepo.findById(id);
  return m ? toPublic(m) : null;
}

export async function updateKyc(
  id: string,
  input: { pan: string; bankAccount: string; ifsc: string },
): Promise<MerchantPublic | null> {
  const ifsc = input.ifsc.toUpperCase();
  const updated = await merchantsRepo.updateKyc(id, {
    pan: encryptString(input.pan.toUpperCase()),
    bankAccount: encryptString(input.bankAccount),
    ifsc,
    kycStatus: "VERIFIED",
  });
  return updated ? toPublic(updated) : null;
}

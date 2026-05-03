import * as merchantsRepo from "../repositories/merchants";
import { getProvider } from "../providers";
import { decryptString, encryptString } from "../utils/crypto";
import { logger } from "../utils/logger";
import type { Merchant } from "@workspace/db";

export class VendorError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function requireKycFields(m: Merchant): {
  pan: string;
  bankAccount: string;
  ifsc: string;
  holder: string;
} {
  const pan = decryptString(m.pan);
  const bankAccount = decryptString(m.bankAccount);
  const ifsc = m.ifsc;
  const holder = m.bankAccountHolderName;
  if (!pan || !bankAccount || !ifsc || !holder) {
    throw new VendorError(
      "Merchant is missing PAN / bank account / IFSC / holder name",
      412,
    );
  }
  return { pan, bankAccount, ifsc, holder };
}

/**
 * Register the merchant as a beneficiary/vendor on the provider so funds can
 * be routed to their bank account. Idempotent — safe to call from KYC
 * approval and from the periodic vendor-sync cron.
 *
 * For Decentro: registers a beneficiary (bank account + IFSC, or UPI VPA).
 * The returned beneficiary_id is stored in merchant.providerMerchantId and
 * used as payee_account when generating QR codes.
 */
export async function ensureVendor(merchantId: string): Promise<{
  vendorId: string;
  status: string;
}> {
  const merchant = await merchantsRepo.findById(merchantId);
  if (!merchant) throw new VendorError("Merchant not found", 404);
  if (merchant.kycStatus !== "APPROVED" && merchant.kycStatus !== "VERIFIED") {
    throw new VendorError("KYC must be APPROVED before vendor registration", 412);
  }

  const provider = getProvider(merchant.preferredProvider);
  const existingVendorId = decryptString(merchant.providerMerchantId);
  const merchantVpa = decryptString(merchant.providerVpa);

  // Already ACTIVE — nothing to do.
  if (existingVendorId && merchant.providerStatus === "ACTIVE") {
    return { vendorId: existingVendorId, status: "ACTIVE" };
  }

  // Already registered but pending — refresh status.
  if (existingVendorId && provider.getVendorStatus) {
    try {
      const r = await provider.getVendorStatus(existingVendorId);
      await merchantsRepo.setProviderVendor(merchant.id, {
        providerMerchantId: encryptString(existingVendorId),
        providerStatus: r.status,
      });
      return { vendorId: existingVendorId, status: r.status };
    } catch (e) {
      logger.warn(
        { err: e, merchantId },
        "[vendor] getVendorStatus failed; will retry next cycle",
      );
      return { vendorId: existingVendorId, status: merchant.providerStatus };
    }
  }

  // Not yet registered — create beneficiary on provider.
  if (!provider.createVendor) {
    throw new VendorError(
      `Provider ${provider.name} does not support vendor registration`,
      501,
    );
  }

  const { pan, bankAccount, ifsc, holder } = requireKycFields(merchant);

  const result = await provider.createVendor({
    merchantId: merchant.id,
    name: merchant.businessName,
    email: merchant.email,
    phone: "9999999999",
    pan,
    bankAccountNumber: bankAccount,
    bankAccountHolderName: holder,
    ifsc,
    vpa: merchantVpa || null,
  });

  await merchantsRepo.setProviderVendor(merchant.id, {
    providerMerchantId: encryptString(result.vendorId),
    providerStatus: result.status,
  });

  logger.info(
    { merchantId, vendorId: result.vendorId, status: result.status },
    "[vendor] registered beneficiary with provider",
  );
  return { vendorId: result.vendorId, status: result.status };
}

/**
 * Re-register a vendor when the merchant's UPI VPA changes.
 * Clears the existing beneficiary_id so ensureVendor will create a fresh one.
 */
export async function resetAndReregisterVendor(merchantId: string): Promise<{
  vendorId: string;
  status: string;
} | null> {
  const merchant = await merchantsRepo.findById(merchantId);
  if (!merchant) return null;
  if (merchant.kycStatus !== "APPROVED" && merchant.kycStatus !== "VERIFIED") {
    return null;
  }

  // Clear existing vendor record so ensureVendor recreates it.
  await merchantsRepo.setProviderVendor(merchantId, {
    providerMerchantId: null,
    providerStatus: "PENDING",
  });

  try {
    return await ensureVendor(merchantId);
  } catch (e) {
    logger.warn(
      { err: e, merchantId },
      "[vendor] resetAndReregisterVendor failed",
    );
    return null;
  }
}

/**
 * Cron-friendly batch: pulls APPROVED merchants whose vendor record is missing
 * or PENDING and re-runs ensureVendor on each.
 */
export async function syncPendingVendors(): Promise<number> {
  const pending = await merchantsRepo.findApprovedNeedingVendor();
  let updates = 0;
  for (const m of pending) {
    try {
      const before = m.providerStatus;
      const r = await ensureVendor(m.id);
      if (r.status !== before) updates++;
    } catch (e) {
      logger.warn(
        { err: e, merchantId: m.id },
        "[vendor:sync] ensureVendor failed",
      );
    }
  }
  return updates;
}

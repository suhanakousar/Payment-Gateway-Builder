import crypto from "node:crypto";
import QRCode from "qrcode";
import type {
  PaymentProvider,
  ProviderOrderInput,
  ProviderOrderResult,
  ProviderRefundResult,
  ProviderStatus,
} from "./types";

/**
 * Mock UPI provider. Generates a UPI deep link, returns "PENDING" until the
 * webhook (or simulate endpoint) flips status. Stand-in for Decentro/Pinelabs.
 */
const PROVIDER_VPA = process.env["PROVIDER_VPA"] ?? "paylite@upi";

export const mockProvider: PaymentProvider = {
  name: "mock",

  async createQR(input: ProviderOrderInput): Promise<ProviderOrderResult> {
    const txnId = `TXN_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const params = new URLSearchParams({
      pa: PROVIDER_VPA,
      pn: input.businessName,
      am: input.amount.toFixed(2),
      cu: "INR",
      tn: input.orderId,
      tr: txnId,
    });
    const qrString = `upi://pay?${params.toString()}`;
    const qrImage = await QRCode.toDataURL(qrString, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
    });
    return { txnId, qrString, qrImage };
  },

  async fetchPaymentStatus(_txnId: string): Promise<ProviderStatus> {
    // The mock provider has no remote source of truth. The reconciliation job
    // will see this and leave the order alone — useful for ensuring the cron
    // path is exercised without flipping random orders to SUCCESS.
    return "PENDING";
  },

  async refund(_txnId: string, _amount: number): Promise<ProviderRefundResult> {
    // Mock refund always succeeds immediately.
    return { ok: true, status: "SUCCESS" };
  },
};

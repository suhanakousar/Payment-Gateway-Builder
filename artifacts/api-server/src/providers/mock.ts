import crypto from "node:crypto";
import QRCode from "qrcode";
import { hmacSha256Hex, timingSafeEqualHex } from "../utils/crypto";
import type {
  PaymentProvider,
  ProviderOrderInput,
  ProviderOrderResult,
  ProviderRefundResult,
  ProviderStatus,
  ProviderWebhookPayload,
} from "./types";

/**
 * Mock UPI provider. No remote API — useful as a baseline and for offline tests.
 * Signature scheme: HMAC-SHA256 hex over raw body, header `x-paylite-signature`.
 */
const PROVIDER_VPA = process.env["PROVIDER_VPA"] ?? "paylite@upi";
const MOCK_SECRET = process.env["WEBHOOK_SECRET"] ?? "dev-webhook-secret";

export const mockProvider: PaymentProvider = {
  name: "mock",
  displayName: "PayLite Mock",
  isAvailable: () => true,

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
    return { txnId, providerOrderId: txnId, qrString, qrImage };
  },

  async fetchPaymentStatus(_txnId: string): Promise<ProviderStatus> {
    return "PENDING";
  },

  async refund(_txnId: string, _amount: number): Promise<ProviderRefundResult> {
    return {
      ok: true,
      status: "SUCCESS",
      providerRefundId: `mock_rfnd_${crypto.randomBytes(6).toString("hex")}`,
    };
  },

  parseWebhook(rawBody, headers): ProviderWebhookPayload {
    const sig = headers["x-paylite-signature"];
    if (!sig) throw new Error("Missing signature");
    const expected = hmacSha256Hex(MOCK_SECRET, rawBody);
    if (!timingSafeEqualHex(expected, sig)) throw new Error("Invalid signature");
    const body = JSON.parse(rawBody.toString("utf8")) as {
      txn_id?: string;
      status?: string;
      method?: string;
    };
    if (!body.txn_id || !body.status) throw new Error("txn_id and status required");
    const status = body.status.toUpperCase() as ProviderStatus;
    return {
      txnId: body.txn_id,
      status,
      paymentMethod: (body.method?.toUpperCase() as ProviderWebhookPayload["paymentMethod"]) ?? "UPI",
    };
  },
};

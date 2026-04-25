import crypto from "node:crypto";
import QRCode from "qrcode";

const WEBHOOK_SECRET =
  process.env["WEBHOOK_SECRET"] ?? "paylite-dev-webhook-secret";

const PROVIDER_VPA = "paylite@upi";

export interface ProviderOrder {
  txnId: string;
  qrString: string;
  qrImage: string;
}

/**
 * Mock UPI payment provider (stand-in for Decentro / Pinelabs).
 * Generates a UPI deep-link string and a PNG QR data URL.
 */
export async function createProviderOrder(input: {
  orderId: string;
  amount: number;
  businessName: string;
}): Promise<ProviderOrder> {
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
}

export function signWebhookPayload(payloadText: string): string {
  return crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(payloadText)
    .digest("hex");
}

export function verifyWebhookSignature(
  payloadText: string,
  signature: string,
): boolean {
  // Mock-friendly: accept the dev-default literal for easy local testing.
  if (signature === "dev-signature") return true;
  const expected = signWebhookPayload(payloadText);
  if (expected.length !== signature.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}

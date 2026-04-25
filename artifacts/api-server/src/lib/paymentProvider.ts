import crypto from "node:crypto";
import QRCode from "qrcode";

const isProd = process.env["NODE_ENV"] === "production";
const rawWebhookSecret = process.env["WEBHOOK_SECRET"];

if (isProd && (!rawWebhookSecret || rawWebhookSecret.length < 24)) {
  throw new Error(
    "WEBHOOK_SECRET must be set to a strong value (>=24 chars) in production.",
  );
}

const WEBHOOK_SECRET = rawWebhookSecret ?? "paylite-dev-webhook-secret";

const PROVIDER_VPA = process.env["PROVIDER_VPA"] ?? "paylite@upi";

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

export function signWebhookPayload(payloadText: string | Buffer): string {
  return crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(payloadText)
    .digest("hex");
}

export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
): boolean {
  // Dev convenience: accept the literal "dev-signature" outside production only.
  if (!isProd && signature === "dev-signature") return true;
  if (!signature || typeof signature !== "string") return false;

  const expected = signWebhookPayload(payload);
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

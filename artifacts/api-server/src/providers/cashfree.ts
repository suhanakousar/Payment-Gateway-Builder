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
 * Cashfree-shaped adapter. Real API used when CASHFREE_APP_ID +
 * CASHFREE_SECRET_KEY are present; otherwise local stub.
 *
 * Inbound webhook signature scheme (Cashfree v3):
 *   x-webhook-signature = base64(hmac_sha256(secret, timestamp + raw_body))
 *   x-webhook-timestamp = unix epoch seconds
 */
const APP_ID = process.env["CASHFREE_APP_ID"] ?? "";
const SECRET = process.env["CASHFREE_SECRET_KEY"] ?? "";
const WEBHOOK_SECRET =
  process.env["CASHFREE_WEBHOOK_SECRET"] ?? SECRET ?? process.env["WEBHOOK_SECRET"] ?? "dev-webhook-secret";
const CF_BASE = process.env["CASHFREE_BASE"] ?? "https://sandbox.cashfree.com/pg";
const PROVIDER_VPA = process.env["CASHFREE_VPA"] ?? "paylite.cf@cashfree";
const LIVE = Boolean(APP_ID && SECRET);

function cfId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function hmacBase64(secret: string, payload: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64");
}

export const cashfreeProvider: PaymentProvider = {
  name: "cashfree",
  displayName: "Cashfree",
  isAvailable: () => true,

  async createQR(input: ProviderOrderInput): Promise<ProviderOrderResult> {
    if (LIVE) {
      const orderRes = await fetch(`${CF_BASE}/orders`, {
        method: "POST",
        headers: {
          "x-client-id": APP_ID,
          "x-client-secret": SECRET,
          "x-api-version": "2023-08-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          order_amount: Math.round(input.amount * 100) / 100,
          order_currency: "INR",
          order_id: input.orderId,
          customer_details: {
            customer_id: `cust_${crypto.randomBytes(4).toString("hex")}`,
            customer_name: input.customerName ?? input.businessName,
            customer_email: input.customerEmail ?? "noreply@paylite.in",
            customer_phone: "9999999999",
          },
        }),
      });
      if (!orderRes.ok) {
        throw new Error(`Cashfree order failed ${orderRes.status}`);
      }
      const order = (await orderRes.json()) as { cf_order_id: string; payment_session_id: string };
      const qrString = `upi://pay?${new URLSearchParams({
        pa: PROVIDER_VPA,
        pn: input.businessName,
        am: input.amount.toFixed(2),
        cu: "INR",
        tn: input.orderId,
      }).toString()}`;
      const qrImage = await QRCode.toDataURL(qrString, { width: 320, margin: 1 });
      return {
        txnId: order.cf_order_id,
        providerOrderId: order.cf_order_id,
        qrString,
        qrImage,
        checkoutUrl: `https://payments.cashfree.com/order/#${order.payment_session_id}`,
      };
    }

    // Sandbox stub
    const orderId = cfId("cf_order");
    const qrString = `upi://pay?${new URLSearchParams({
      pa: PROVIDER_VPA,
      pn: input.businessName,
      am: input.amount.toFixed(2),
      cu: "INR",
      tn: input.orderId,
      tr: orderId,
    }).toString()}`;
    const qrImage = await QRCode.toDataURL(qrString, { width: 320, margin: 1 });
    return { txnId: orderId, providerOrderId: orderId, qrString, qrImage };
  },

  async fetchPaymentStatus(_txnId: string): Promise<ProviderStatus> {
    return "PENDING";
  },

  async refund(_txnId: string, _amount: number): Promise<ProviderRefundResult> {
    return {
      ok: true,
      status: "SUCCESS",
      providerRefundId: cfId("cf_rfnd"),
    };
  },

  parseWebhook(rawBody, headers): ProviderWebhookPayload {
    const sig = headers["x-webhook-signature"];
    const ts = headers["x-webhook-timestamp"];
    if (!sig || !ts) throw new Error("Missing x-webhook-signature/timestamp");
    const expected = hmacBase64(WEBHOOK_SECRET, ts + rawBody.toString("utf8"));
    if (
      expected.length !== sig.length ||
      !timingSafeEqualHex(
        Buffer.from(expected).toString("hex"),
        Buffer.from(sig).toString("hex"),
      )
    ) {
      throw new Error("Invalid signature");
    }

    interface CfPayload {
      type?: string;
      data?: {
        order?: { order_id?: string };
        payment?: { cf_payment_id?: number; payment_status?: string; payment_method?: { upi?: unknown; card?: unknown } };
        dispute?: { dispute_id?: string; dispute_reason?: string; dispute_amount?: number; cf_payment_id?: string };
      };
    }
    const body = JSON.parse(rawBody.toString("utf8")) as CfPayload;
    const txnId = body.data?.order?.order_id ?? "";
    if (!txnId) throw new Error("No order_id in webhook");

    if (body.type === "DISPUTE_CREATED") {
      const d = body.data?.dispute;
      return {
        txnId,
        status: "SUCCESS",
        dispute: {
          reason: d?.dispute_reason ?? "unknown",
          amount: d?.dispute_amount ?? 0,
        },
      };
    }
    const ps = body.data?.payment?.payment_status?.toUpperCase();
    let status: ProviderStatus = "PENDING";
    if (ps === "SUCCESS") status = "SUCCESS";
    else if (ps === "FAILED" || ps === "USER_DROPPED") status = "FAILED";
    else if (ps === "CANCELLED") status = "EXPIRED";

    const m = body.data?.payment?.payment_method;
    const method: ProviderWebhookPayload["paymentMethod"] = m?.upi
      ? "UPI"
      : m?.card
        ? "CARD"
        : "UPI";
    return { txnId, status, paymentMethod: method };
  },
};

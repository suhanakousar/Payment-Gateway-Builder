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
 * Razorpay-shaped adapter. When RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET are
 * present this hits the real Razorpay sandbox API; otherwise it runs in a
 * local-stub mode that returns realistic Razorpay-shaped payloads (rzp_*
 * prefixes, paise amounts, BQR strings) so the rest of the platform exercises
 * the integration code path without external network.
 *
 * Inbound webhooks are signed per Razorpay's spec:
 *   x-razorpay-signature: hex(hmac_sha256(secret, raw_body))
 */
const KEY_ID = process.env["RAZORPAY_KEY_ID"] ?? "";
const KEY_SECRET = process.env["RAZORPAY_KEY_SECRET"] ?? "";
const WEBHOOK_SECRET =
  process.env["RAZORPAY_WEBHOOK_SECRET"] ??
  process.env["WEBHOOK_SECRET"] ??
  "dev-webhook-secret";
const RZP_BASE = "https://api.razorpay.com/v1";
const PROVIDER_VPA = process.env["RAZORPAY_VPA"] ?? "paylite.rzp@razorpay";
const LIVE = Boolean(KEY_ID && KEY_SECRET);

function rzpId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(7).toString("hex").slice(0, 14)}`;
}

async function callRzp<T>(path: string, body: unknown): Promise<T> {
  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64");
  const res = await fetch(`${RZP_BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Razorpay ${path} ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export const razorpayProvider: PaymentProvider = {
  name: "razorpay",
  displayName: "Razorpay",
  isAvailable: () => true,

  async createQR(input: ProviderOrderInput): Promise<ProviderOrderResult> {
    const providerVpa = input.merchantConfig?.providerVpa || PROVIDER_VPA;
    if (LIVE) {
      // Real Razorpay API: create an order, then a QR linked to it.
      const order = await callRzp<{ id: string }>("/orders", {
        amount: Math.round(input.amount * 100),
        currency: "INR",
        receipt: input.orderId,
        notes: {
          businessName: input.businessName,
          merchantId: input.merchantConfig?.merchantId ?? "",
          providerMerchantId: input.merchantConfig?.providerMerchantId ?? "",
          providerStoreId: input.merchantConfig?.providerStoreId ?? "",
          providerTerminalId: input.merchantConfig?.providerTerminalId ?? "",
        },
      });
      const qr = await callRzp<{ id: string; image_url: string; qr_code: string }>(
        "/payments/qr_codes",
        {
          type: "upi_qr",
          name: input.businessName.slice(0, 27),
          usage: "single_use",
          fixed_amount: true,
          payment_amount: Math.round(input.amount * 100),
          description: input.orderId,
          notes: { orderId: input.orderId, rzpOrderId: order.id },
        },
      );
      const qrImage = await QRCode.toDataURL(qr.qr_code, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 320,
      });
      return {
        txnId: qr.id,
        providerOrderId: order.id,
        qrString: qr.qr_code,
        qrImage,
      };
    }

    // Sandbox stub: identical surface, no network.
    const orderId = rzpId("order");
    const qrId = rzpId("qr");
      const qrString = `upi://pay?${new URLSearchParams({
        pa: providerVpa,
        pn: input.businessName,
        am: input.amount.toFixed(2),
        cu: "INR",
      tn: input.orderId,
      tr: qrId,
    }).toString()}`;
    const qrImage = await QRCode.toDataURL(qrString, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
    });
    return {
      txnId: qrId,
      providerOrderId: orderId,
      qrString,
      qrImage,
    };
  },

  async fetchPaymentStatus(txnId: string): Promise<ProviderStatus> {
    if (!LIVE) return "PENDING";
    const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64");
    const res = await fetch(`${RZP_BASE}/payments/qr_codes/${txnId}/payments`, {
      headers: { authorization: `Basic ${auth}` },
    });
    if (!res.ok) return "PENDING";
    const json = (await res.json()) as { items?: Array<{ status: string }> };
    const captured = json.items?.find((i) => i.status === "captured");
    if (captured) return "SUCCESS";
    const failed = json.items?.find((i) => i.status === "failed");
    if (failed) return "FAILED";
    return "PENDING";
  },

  async refund(txnId: string, amount: number): Promise<ProviderRefundResult> {
    if (LIVE) {
      try {
        const r = await callRzp<{ id: string; status: string }>(
          `/payments/${txnId}/refund`,
          { amount: Math.round(amount * 100), speed: "normal" },
        );
        return {
          ok: true,
          status: r.status === "processed" ? "SUCCESS" : "INITIATED",
          providerRefundId: r.id,
        };
      } catch (e) {
        return { ok: false, status: "FAILED", error: e instanceof Error ? e.message : String(e) };
      }
    }
    return {
      ok: true,
      status: "SUCCESS",
      providerRefundId: rzpId("rfnd"),
    };
  },

  parseWebhook(rawBody, headers): ProviderWebhookPayload {
    const sig = headers["x-razorpay-signature"];
    if (!sig) throw new Error("Missing x-razorpay-signature");
    const expected = hmacSha256Hex(WEBHOOK_SECRET, rawBody);
    if (!timingSafeEqualHex(expected, sig)) throw new Error("Invalid signature");

    interface RzpPayload {
      event?: string;
      payload?: {
        payment?: {
          entity?: {
            id?: string;
            status?: string;
            method?: string;
            notes?: { qr_code_id?: string };
          };
        };
        qr_code?: { entity?: { id?: string } };
        refund?: { entity?: { payment_id?: string } };
        dispute?: { entity?: { id?: string; reason_code?: string; amount?: number; payment_id?: string } };
      };
    }
    const body = JSON.parse(rawBody.toString("utf8")) as RzpPayload;
    const event = body.event ?? "";
    const payment = body.payload?.payment?.entity;
    // We use the QR id as our txnId — Razorpay tags it on the payment via notes.
    const txnId =
      body.payload?.qr_code?.entity?.id ??
      payment?.notes?.qr_code_id ??
      body.payload?.dispute?.entity?.payment_id ??
      payment?.id ??
      "";
    if (!txnId) throw new Error("No txn id in webhook");

    if (event.startsWith("payment.dispute")) {
      const d = body.payload?.dispute?.entity;
      return {
        txnId,
        status: "SUCCESS", // payment was already captured before dispute
        dispute: {
          reason: d?.reason_code ?? "unknown",
          amount: (d?.amount ?? 0) / 100,
        },
      };
    }

    let status: ProviderStatus = "PENDING";
    if (event === "payment.captured" || event === "qr_code.credited") status = "SUCCESS";
    else if (event === "payment.failed") status = "FAILED";
    else if (event === "qr_code.closed") status = "EXPIRED";

    const method = payment?.method?.toUpperCase();
    return {
      txnId,
      status,
      paymentMethod:
        method === "UPI" || method === "CARD" || method === "NETBANKING" || method === "WALLET"
          ? (method as ProviderWebhookPayload["paymentMethod"])
          : "UPI",
    };
  },
};

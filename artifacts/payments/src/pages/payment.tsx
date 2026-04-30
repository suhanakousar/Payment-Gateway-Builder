import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, Clock, Smartphone, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface OrderPublic {
  id: string;
  orderId: string;
  txnId: string | null;
  amount: number;
  status: string;
  customerName: string | null;
  qrString: string | null;
  receiverVpa: string | null;
  receiverLabel: string | null;
  expiresAt: string;
  createdAt: string;
}

function StatusBanner({ status }: { status: string }) {
  if (status === "SUCCESS") {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="border border-emerald-200 bg-emerald-50 text-emerald-800 rounded-md px-4 py-3 flex items-center gap-2"
      >
        <CheckCircle2 size={16} /> Payment received. Thanks!
      </motion.div>
    );
  }
  if (status === "FAILED") {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="border border-rose-200 bg-rose-50 text-rose-800 rounded-md px-4 py-3 flex items-center gap-2"
      >
        <XCircle size={16} /> Payment failed. Please try again.
      </motion.div>
    );
  }
  if (status === "EXPIRED") {
    return (
      <div className="border border-neutral-200 bg-neutral-50 text-neutral-700 rounded-md px-4 py-3 flex items-center gap-2">
        <Clock size={16} /> This payment link has expired.
      </div>
    );
  }
  return null;
}

export default function PaymentPage() {
  const [, params] = useRoute("/payment/:orderId");
  const orderId = params?.orderId ?? "";

  const orderQuery = useQuery({
    queryKey: ["public-order", orderId],
    queryFn: () => api<OrderPublic>(`/orders/${orderId}`),
    enabled: !!orderId,
    refetchInterval: (q) => {
      const o = q.state.data;
      if (!o) return 2_500;
      return o.status === "PENDING" ? 2_500 : false;
    },
  });

  const order = orderQuery.data;
  const checkoutUrl =
    order?.qrString?.startsWith("http://") || order?.qrString?.startsWith("https://")
      ? order.qrString
      : null;

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!order?.qrString || checkoutUrl) {
      setQrDataUrl(null);
      return;
    }
    import("qrcode").then((mod) => {
      mod
        .toDataURL(order.qrString!, { width: 280, margin: 1 })
        .then((url) => {
          if (!cancelled) setQrDataUrl(url);
        })
        .catch(() => setQrDataUrl(null));
    });
    return () => {
      cancelled = true;
    };
  }, [order?.qrString, checkoutUrl]);

  const showDemoControls = import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_CONTROLS === "true";

  async function simulate(outcome: "SUCCESS" | "FAILED") {
    if (!order?.txnId) return;
    try {
      await api(`/orders/${order.txnId}/simulate`, {
        method: "POST",
        body: { outcome },
      });
      orderQuery.refetch();
      toast.success(outcome === "SUCCESS" ? "Marked as paid" : "Marked as failed");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Simulation failed");
    }
  }

  if (orderQuery.isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-neutral-200 border-t-neutral-800 animate-spin" />
      </div>
    );
  }
  if (orderQuery.isError || !order) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Order not found</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Check the link or contact the merchant.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      <header className="border-b border-neutral-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          <span className="font-semibold tracking-tight">PayLite</span>
          <span className="text-xs text-neutral-500 ml-auto font-mono">
            {order.orderId}
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-md border border-neutral-200 bg-white rounded-xl p-6 space-y-5"
        >
          <div className="text-center">
            <div className="text-xs uppercase tracking-wide text-neutral-500">
              Amount due
            </div>
            <div className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">
              ₹{order.amount.toLocaleString("en-IN")}
            </div>
            {order.customerName && (
              <div className="mt-1 text-sm text-neutral-600">
                For {order.customerName}
              </div>
            )}
          </div>

          <AnimatePresence mode="wait">
            {order.status === "PENDING" && (
              <motion.div
                key="pending"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {checkoutUrl ? (
                  <div className="border border-neutral-200 rounded-lg p-6 bg-gradient-to-b from-neutral-50 to-white text-center space-y-3">
                    <div className="mx-auto h-14 w-14 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center">
                      <Smartphone size={24} />
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-neutral-900">
                        Secure Cashfree checkout
                      </div>
                      <div className="text-xs text-neutral-500">
                        Tap below to continue payment on Cashfree and complete the transaction.
                      </div>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => {
                        window.location.href = checkoutUrl;
                      }}
                    >
                      Pay Securely
                    </Button>
                  </div>
                ) : (
                  <div className="border border-neutral-200 rounded-lg p-3 flex items-center justify-center bg-white">
                    {qrDataUrl ? (
                      <img src={qrDataUrl} alt="UPI QR code" className="rounded" width={240} height={240} />
                    ) : (
                      <div className="h-[240px] w-[240px] flex items-center justify-center text-neutral-400 text-sm">
                        Generating QR…
                      </div>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-neutral-600 justify-center">
                  <Smartphone size={14} className="text-neutral-400" />
                  {checkoutUrl
                    ? "Complete payment on the secure Cashfree page"
                    : "Open any UPI app and scan to pay"}
                </div>
                {(order.receiverLabel || order.receiverVpa) && (
                  <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                    Paying to{" "}
                    <span className="font-medium text-neutral-900">
                      {order.receiverLabel ?? "merchant"}
                    </span>
                    {order.receiverVpa ? (
                      <>
                        {" "}
                        via <span className="font-mono text-neutral-800">{order.receiverVpa}</span>
                      </>
                    ) : null}
                  </div>
                )}
                {order.qrString && !checkoutUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      navigator.clipboard.writeText(order.qrString!);
                      toast.success("UPI link copied");
                    }}
                  >
                    <Copy size={12} className="mr-1.5" /> Copy UPI link
                  </Button>
                )}
                <div className="flex items-center justify-center gap-1 text-xs text-neutral-500">
                  <RefreshCw size={11} className="animate-spin-slow" />
                  Watching for payment…
                </div>
              </motion.div>
            )}

            {order.status !== "PENDING" && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                <StatusBanner status={order.status} />
              </motion.div>
            )}
          </AnimatePresence>

          {showDemoControls && order.status === "PENDING" && order.txnId && (
            <div className="border-t border-neutral-200 pt-4 space-y-2">
              <div className="text-xs uppercase tracking-wide text-neutral-500 text-center">
                Demo controls
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => simulate("SUCCESS")}
                >
                  Mark as paid
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => simulate("FAILED")}
                >
                  Mark as failed
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      </main>

      <footer className="border-t border-neutral-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-3 text-xs text-neutral-500 text-center">
          Secured by PayLite
        </div>
      </footer>
    </div>
  );
}

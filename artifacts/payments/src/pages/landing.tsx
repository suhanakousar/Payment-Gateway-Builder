import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  Zap,
  QrCode,
  Webhook,
  RefreshCw,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: QrCode,
    title: "Instant UPI orders",
    body: "Generate signed UPI QR codes for any amount. Customers pay from any UPI app.",
  },
  {
    icon: Webhook,
    title: "Reliable webhooks",
    body: "Signed merchant webhooks with retries, delivery logs and a built-in test ping.",
  },
  {
    icon: ShieldCheck,
    title: "Built for trust",
    body: "Encrypted KYC, signed inbound webhooks, CSRF-protected sessions, and fraud flags.",
  },
  {
    icon: RefreshCw,
    title: "Refunds & reconciliation",
    body: "One-click refunds plus background reconciliation against your provider of record.",
  },
  {
    icon: BarChart3,
    title: "Dashboard you'll use",
    body: "Filterable orders, search, CSV export, and a daily revenue summary.",
  },
  {
    icon: Zap,
    title: "Provider-agnostic",
    body: "Adapter pattern so you can switch from the mock provider to Decentro or Razorpay.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="border-b border-neutral-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="font-semibold tracking-tight text-lg">PayLite</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/signup">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-600 mb-6"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Production-ready payment infrastructure
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut", delay: 0.05 }}
          className="text-4xl sm:text-6xl font-semibold tracking-tight max-w-3xl mx-auto"
        >
          Accept UPI payments without the heavy lift.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut", delay: 0.15 }}
          className="mt-5 text-base sm:text-lg text-neutral-600 max-w-2xl mx-auto"
        >
          PayLite gives small businesses a clean dashboard, signed webhooks,
          fraud signals and refunds — all behind a swappable provider adapter.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut", delay: 0.25 }}
          className="mt-8 flex items-center justify-center gap-3"
        >
          <Link href="/signup">
            <Button size="lg" className="group">
              Create merchant account
              <ArrowRight size={16} className="ml-1 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline">Sign in</Button>
          </Link>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-6 text-xs text-neutral-500"
        >
          Demo merchant: <span className="font-mono">demo@paylite.in</span> /{" "}
          <span className="font-mono">demo1234</span>
        </motion.p>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-neutral-200 border border-neutral-200 rounded-xl overflow-hidden">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.4, delay: i * 0.05, ease: "easeOut" }}
              className="bg-white p-6 hover:bg-neutral-50/60 transition-colors"
            >
              <div className="h-9 w-9 rounded-md border border-neutral-200 flex items-center justify-center mb-4">
                <f.icon size={16} className="text-neutral-700" />
              </div>
              <h3 className="font-medium text-sm mb-1.5">{f.title}</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">{f.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <footer className="border-t border-neutral-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-xs text-neutral-500 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>© {new Date().getFullYear()} PayLite — a reference fintech.</div>
          <div className="font-mono">v0.2.0</div>
        </div>
      </footer>
    </div>
  );
}

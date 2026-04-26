import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  TrendingUp,
  AlertTriangle,
  Receipt,
  CheckCircle2,
  Clock,
  XCircle,
  ArrowUpRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

interface Summary {
  totalOrders: number;
  paidOrders: number;
  pendingOrders: number;
  failedOrders: number;
  refundedOrders: number;
  flaggedOrders: number;
  totalCollectedPaise: number;
  todayCollectedPaise: number;
  successRate: number;
}

interface OrderRow {
  id: string;
  orderId: string;
  amount: number;
  status: string;
  customerName: string | null;
  fraudFlag: boolean;
  createdAt: string;
}

function rupees(paise: number) {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  });
}

function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  delay = 0,
}: {
  title: string;
  value: string | number;
  hint?: string;
  icon: typeof TrendingUp;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: "easeOut" }}
      className="border border-neutral-200 bg-white rounded-xl p-5 hover:border-neutral-300 transition-colors"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-wide text-neutral-500">
          {title}
        </span>
        <Icon size={14} className="text-neutral-400" />
      </div>
      <div className="text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </div>
      {hint && (
        <div className="text-xs text-neutral-500 mt-1.5">{hint}</div>
      )}
    </motion.div>
  );
}

const STATUS_TONE: Record<string, string> = {
  SUCCESS: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  FAILED: "bg-rose-50 text-rose-700 border-rose-200",
  EXPIRED: "bg-neutral-100 text-neutral-600 border-neutral-200",
  REFUNDED: "bg-violet-50 text-violet-700 border-violet-200",
};

function StatusPill({ value }: { value: string }) {
  const cls = STATUS_TONE[value] ?? STATUS_TONE.PENDING;
  return (
    <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded border ${cls}`}>
      {value}
    </span>
  );
}

export default function Dashboard() {
  const { merchant } = useAuth();
  const summaryQuery = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: () => api<Summary>("/dashboard/summary"),
    refetchInterval: 15_000,
  });
  const recentQuery = useQuery({
    queryKey: ["orders", "recent"],
    queryFn: () => api<OrderRow[]>("/orders", { query: { limit: 8 } }),
    refetchInterval: 15_000,
  });

  const summary = summaryQuery.data;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome back, {merchant?.name?.split(" ")[0] ?? "there"}
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Here's a snapshot of {merchant?.businessName ?? "your business"}.
          </p>
        </div>
        <Link href="/orders">
          <Button variant="outline" size="sm">
            View all orders <ArrowUpRight size={14} className="ml-1" />
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Today's revenue"
          value={summary ? rupees(summary.todayCollectedPaise) : "—"}
          hint="Successful orders today"
          icon={TrendingUp}
          delay={0}
        />
        <StatCard
          title="Lifetime revenue"
          value={summary ? rupees(summary.totalCollectedPaise) : "—"}
          hint={summary ? `${summary.paidOrders} paid orders` : undefined}
          icon={Receipt}
          delay={0.05}
        />
        <StatCard
          title="Success rate"
          value={summary ? `${summary.successRate}%` : "—"}
          hint={summary ? `${summary.totalOrders} total` : undefined}
          icon={CheckCircle2}
          delay={0.1}
        />
        <StatCard
          title="Flagged"
          value={summary?.flaggedOrders ?? "—"}
          hint="Fraud signals triggered"
          icon={AlertTriangle}
          delay={0.15}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.18 }}
          className="border border-neutral-200 bg-white rounded-xl p-5 flex items-center gap-3"
        >
          <Clock size={18} className="text-amber-500" />
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500">Pending</div>
            <div className="text-xl font-semibold tabular-nums">{summary?.pendingOrders ?? "—"}</div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.22 }}
          className="border border-neutral-200 bg-white rounded-xl p-5 flex items-center gap-3"
        >
          <XCircle size={18} className="text-rose-500" />
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500">Failed</div>
            <div className="text-xl font-semibold tabular-nums">{summary?.failedOrders ?? "—"}</div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.26 }}
          className="border border-neutral-200 bg-white rounded-xl p-5 flex items-center gap-3"
        >
          <Receipt size={18} className="text-violet-500" />
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500">Refunded</div>
            <div className="text-xl font-semibold tabular-nums">{summary?.refundedOrders ?? "—"}</div>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.3 }}
        className="border border-neutral-200 bg-white rounded-xl overflow-hidden"
      >
        <div className="px-5 py-4 flex items-center justify-between border-b border-neutral-200">
          <div>
            <h2 className="font-medium text-sm">Recent orders</h2>
            <p className="text-xs text-neutral-500">Latest 8 orders for your account</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-neutral-500 bg-neutral-50">
              <tr>
                <th className="text-left font-medium px-5 py-2.5">Order</th>
                <th className="text-left font-medium px-5 py-2.5">Customer</th>
                <th className="text-right font-medium px-5 py-2.5">Amount</th>
                <th className="text-left font-medium px-5 py-2.5">Status</th>
                <th className="text-left font-medium px-5 py-2.5">When</th>
              </tr>
            </thead>
            <tbody>
              {recentQuery.isLoading && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-neutral-400 text-sm">
                    Loading…
                  </td>
                </tr>
              )}
              {!recentQuery.isLoading && recentQuery.data?.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-neutral-500 text-sm">
                    No orders yet. Create one from the Orders tab.
                  </td>
                </tr>
              )}
              {recentQuery.data?.map((o, i) => (
                <motion.tr
                  key={o.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="border-t border-neutral-100 hover:bg-neutral-50/60"
                >
                  <td className="px-5 py-3 font-mono text-xs">
                    <Link href="/orders">
                      <span className="cursor-pointer hover:underline">{o.orderId}</span>
                    </Link>
                    {o.fraudFlag && (
                      <span className="ml-2 inline-block text-[10px] text-rose-600 border border-rose-200 bg-rose-50 px-1.5 rounded">
                        flagged
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-neutral-700">{o.customerName ?? "—"}</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    ₹{o.amount.toLocaleString("en-IN")}
                  </td>
                  <td className="px-5 py-3"><StatusPill value={o.status} /></td>
                  <td className="px-5 py-3 text-neutral-500 text-xs">
                    {new Date(o.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}

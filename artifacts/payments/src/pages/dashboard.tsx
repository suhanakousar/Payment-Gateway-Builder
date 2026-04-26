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
  Banknote,
  AlertOctagon,
  CreditCard,
  Server,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
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
  openDisputes: number;
  pendingSettlementPaise: number;
  pendingSettlementCount: number;
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

interface SeriesPoint {
  date: string;
  paise: number;
  orders: number;
}

interface BreakdownPoint {
  label: string;
  value: number;
  paise: number;
}

interface ProviderHealth {
  name: string;
  displayName: string;
  weight: number;
  healthy: boolean;
  circuitOpenMs: number;
  successes: number;
  failures: number;
  lastError: string | null;
  lastSuccessAt: string | null;
}

function rupees(paise: number, opts: { compact?: boolean } = {}) {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
    notation: opts.compact ? "compact" : "standard",
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
      {hint && <div className="text-xs text-neutral-500 mt-1.5">{hint}</div>}
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
    <span
      className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded border ${cls}`}
    >
      {value}
    </span>
  );
}

const PIE_COLORS = ["#10b981", "#6366f1", "#f59e0b", "#ec4899", "#06b6d4"];

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
  const seriesQuery = useQuery({
    queryKey: ["dashboard", "timeseries"],
    queryFn: () => api<SeriesPoint[]>("/dashboard/timeseries", { query: { days: 14 } }),
    refetchInterval: 60_000,
  });
  const methodsQuery = useQuery({
    queryKey: ["dashboard", "methods"],
    queryFn: () => api<BreakdownPoint[]>("/dashboard/methods"),
    refetchInterval: 60_000,
  });
  const providersQuery = useQuery({
    queryKey: ["dashboard", "providers"],
    queryFn: () => api<BreakdownPoint[]>("/dashboard/providers"),
    refetchInterval: 60_000,
  });
  const healthQuery = useQuery({
    queryKey: ["dashboard", "provider-health"],
    queryFn: () => api<ProviderHealth[]>("/dashboard/provider-health"),
    refetchInterval: 30_000,
  });

  const summary = summaryQuery.data;
  const series = (seriesQuery.data ?? []).map((p) => ({
    ...p,
    rupees: p.paise / 100,
    label: new Date(p.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
  }));

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

      {summary && summary.openDisputes > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="border border-rose-200 bg-rose-50 rounded-xl p-4 flex items-start gap-3"
        >
          <AlertOctagon size={18} className="text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-sm font-medium text-rose-900">
              {summary.openDisputes} open dispute{summary.openDisputes === 1 ? "" : "s"} need your attention
            </div>
            <div className="text-xs text-rose-700 mt-0.5">
              You have 7 days from when each one was raised to submit evidence.
            </div>
          </div>
          <Link href="/disputes">
            <Button variant="outline" size="sm" className="border-rose-300 text-rose-800 hover:bg-rose-100">
              Review
            </Button>
          </Link>
        </motion.div>
      )}

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

      {/* Revenue chart + settlement card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="lg:col-span-2 border border-neutral-200 bg-white rounded-xl p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-medium">Revenue · last 14 days</h2>
              <p className="text-xs text-neutral-500">Successful collections per day</p>
            </div>
          </div>
          <div className="h-56 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#737373" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#737373" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) =>
                    v === 0
                      ? "0"
                      : v >= 100000
                        ? `₹${(v / 100000).toFixed(1)}L`
                        : v >= 1000
                          ? `₹${(v / 1000).toFixed(0)}k`
                          : `₹${v}`
                  }
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    border: "1px solid #e5e5e5",
                    borderRadius: 8,
                  }}
                  formatter={(v: number) => [
                    `₹${v.toLocaleString("en-IN")}`,
                    "Revenue",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="rupees"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#revFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
          className="border border-neutral-200 bg-white rounded-xl p-5 flex flex-col"
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-medium flex items-center gap-1.5">
                <Banknote size={14} className="text-emerald-500" /> Next settlement
              </h2>
              <p className="text-xs text-neutral-500">T+1 daily payout to your bank</p>
            </div>
          </div>
          <div className="flex-1 flex flex-col justify-center">
            <div className="text-3xl font-semibold tabular-nums">
              {summary ? rupees(summary.pendingSettlementPaise) : "—"}
            </div>
            <div className="text-xs text-neutral-500 mt-1">
              {summary?.pendingSettlementCount
                ? `${summary.pendingSettlementCount} batch${summary.pendingSettlementCount === 1 ? "" : "es"} pending payout`
                : "No pending payout"}
            </div>
          </div>
          <Link href="/settlements">
            <Button variant="outline" size="sm" className="mt-3 w-full">
              View settlements <ArrowUpRight size={14} className="ml-1" />
            </Button>
          </Link>
        </motion.div>
      </div>

      {/* Method + provider donuts + provider health */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.26 }}
          className="border border-neutral-200 bg-white rounded-xl p-5"
        >
          <h3 className="text-sm font-medium flex items-center gap-1.5 mb-1">
            <CreditCard size={14} className="text-neutral-400" /> Payment methods
          </h3>
          <p className="text-xs text-neutral-500 mb-2">By successful order count</p>
          <div className="h-44">
            {(methodsQuery.data ?? []).length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-neutral-400">
                No data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={methodsQuery.data ?? []}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={36}
                    outerRadius={62}
                    paddingAngle={2}
                  >
                    {(methodsQuery.data ?? []).map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      border: "1px solid #e5e5e5",
                      borderRadius: 8,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="border border-neutral-200 bg-white rounded-xl p-5"
        >
          <h3 className="text-sm font-medium flex items-center gap-1.5 mb-1">
            <Server size={14} className="text-neutral-400" /> Routed via
          </h3>
          <p className="text-xs text-neutral-500 mb-2">Which provider handled each order</p>
          <div className="h-44">
            {(providersQuery.data ?? []).length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-neutral-400">
                No data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={providersQuery.data ?? []}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={36}
                    outerRadius={62}
                    paddingAngle={2}
                  >
                    {(providersQuery.data ?? []).map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[(i + 1) % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{
                      fontSize: 12,
                      border: "1px solid #e5e5e5",
                      borderRadius: 8,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.34 }}
          className="border border-neutral-200 bg-white rounded-xl p-5"
        >
          <h3 className="text-sm font-medium flex items-center gap-1.5 mb-1">
            <Server size={14} className="text-neutral-400" /> Provider health
          </h3>
          <p className="text-xs text-neutral-500 mb-3">
            Smart router with circuit breakers
          </p>
          <ul className="space-y-2">
            {(healthQuery.data ?? []).map((p) => (
              <li
                key={p.name}
                className="flex items-center justify-between text-sm border-b last:border-b-0 border-neutral-100 pb-2 last:pb-0"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      p.healthy ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                  />
                  <div>
                    <div className="font-medium">{p.displayName}</div>
                    <div className="text-[11px] text-neutral-500">
                      weight {p.weight} ·{" "}
                      {p.healthy
                        ? `${p.successes} ok / ${p.failures} fail`
                        : `circuit open ${Math.ceil(p.circuitOpenMs / 1000)}s`}
                    </div>
                  </div>
                </div>
              </li>
            ))}
            {(healthQuery.data ?? []).length === 0 && (
              <li className="text-xs text-neutral-400">Loading…</li>
            )}
          </ul>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.38 }}
          className="border border-neutral-200 bg-white rounded-xl p-5 flex items-center gap-3"
        >
          <Clock size={18} className="text-amber-500" />
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500">
              Pending
            </div>
            <div className="text-xl font-semibold tabular-nums">
              {summary?.pendingOrders ?? "—"}
            </div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.42 }}
          className="border border-neutral-200 bg-white rounded-xl p-5 flex items-center gap-3"
        >
          <XCircle size={18} className="text-rose-500" />
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500">
              Failed
            </div>
            <div className="text-xl font-semibold tabular-nums">
              {summary?.failedOrders ?? "—"}
            </div>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.46 }}
          className="border border-neutral-200 bg-white rounded-xl p-5 flex items-center gap-3"
        >
          <Receipt size={18} className="text-violet-500" />
          <div>
            <div className="text-xs uppercase tracking-wide text-neutral-500">
              Refunded
            </div>
            <div className="text-xl font-semibold tabular-nums">
              {summary?.refundedOrders ?? "—"}
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.5 }}
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
                  <td className="px-5 py-3">
                    <StatusPill value={o.status} />
                  </td>
                  <td className="px-5 py-3 text-neutral-500 text-xs">
                    {new Date(o.createdAt).toLocaleString("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
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

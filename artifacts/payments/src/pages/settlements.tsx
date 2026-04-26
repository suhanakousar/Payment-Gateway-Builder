import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Banknote, RefreshCw, BookOpenCheck } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface Settlement {
  id: string;
  settlementDate: string;
  grossPaise: number;
  feePaise: number;
  refundPaise: number;
  netPaise: number;
  orderCount: number;
  status: string;
  bankRef: string | null;
  paidAt: string | null;
  createdAt: string;
}

interface LedgerEntry {
  id: string;
  settlementId: string | null;
  account: string;
  direction: "DEBIT" | "CREDIT";
  amountPaise: number;
  description: string;
  createdAt: string;
}

const ACCOUNT_LABEL: Record<string, string> = {
  gateway_payable: "Gateway payable",
  merchant_payable: "Merchant payout",
  fee_income: "Aggregator fee",
  refund_clearing: "Refund offset",
};

function rupees(paise: number) {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });
}

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
  FAILED: "bg-rose-50 text-rose-700 border-rose-200",
};

export default function Settlements() {
  const qc = useQueryClient();
  const settlementsQ = useQuery({
    queryKey: ["settlements"],
    queryFn: () => api<Settlement[]>("/settlements"),
    refetchInterval: 30_000,
  });
  const ledgerQ = useQuery({
    queryKey: ["ledger"],
    queryFn: () => api<LedgerEntry[]>("/settlements/ledger"),
    refetchInterval: 30_000,
  });

  const runMut = useMutation({
    mutationFn: () =>
      api<{ ok: true; settled: number }>("/settlements/run", {
        method: "POST",
        query: { date: new Date().toISOString().slice(0, 10) },
      }),
    onSuccess: (r) => {
      toast.success(
        r.settled > 0
          ? `Settled ${r.settled} merchant${r.settled === 1 ? "" : "s"}`
          : "No unsettled orders right now",
      );
      qc.invalidateQueries({ queryKey: ["settlements"] });
      qc.invalidateQueries({ queryKey: ["ledger"] });
      qc.invalidateQueries({ queryKey: ["dashboard", "summary"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Run failed"),
  });

  const payMut = useMutation({
    mutationFn: (id: string) =>
      api<Settlement>(`/settlements/${id}/mark-paid`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Marked as paid to bank");
      qc.invalidateQueries({ queryKey: ["settlements"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
  });

  const settlements = settlementsQ.data ?? [];
  const pendingTotal = settlements
    .filter((s) => s.status === "PENDING")
    .reduce((sum, s) => sum + s.netPaise, 0);
  const paidTotal = settlements
    .filter((s) => s.status === "PAID")
    .reduce((sum, s) => sum + s.netPaise, 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settlements</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Daily T+1 payouts to your registered bank account.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => runMut.mutate()}
          disabled={runMut.isPending}
        >
          <RefreshCw size={14} className={`mr-1.5 ${runMut.isPending ? "animate-spin" : ""}`} />
          Run settlement now
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="border border-neutral-200 bg-white rounded-xl p-5"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wide text-neutral-500">
              Pending payout
            </span>
            <Banknote size={14} className="text-amber-500" />
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            {rupees(pendingTotal)}
          </div>
          <div className="text-xs text-neutral-500 mt-1">
            {settlements.filter((s) => s.status === "PENDING").length} batches awaiting bank wire
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="border border-neutral-200 bg-white rounded-xl p-5"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wide text-neutral-500">
              Settled lifetime
            </span>
            <Banknote size={14} className="text-emerald-500" />
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            {rupees(paidTotal)}
          </div>
          <div className="text-xs text-neutral-500 mt-1">Already paid to your bank</div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="border border-neutral-200 bg-white rounded-xl p-5"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wide text-neutral-500">
              Ledger entries
            </span>
            <BookOpenCheck size={14} className="text-neutral-400" />
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            {ledgerQ.data?.length ?? 0}
          </div>
          <div className="text-xs text-neutral-500 mt-1">Double-entry journal lines</div>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="border border-neutral-200 bg-white rounded-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-neutral-200">
          <h2 className="font-medium text-sm">Settlement batches</h2>
          <p className="text-xs text-neutral-500">Each row is one day's roll-up of successful orders.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-neutral-500 bg-neutral-50">
              <tr>
                <th className="text-left font-medium px-5 py-2.5">Date</th>
                <th className="text-right font-medium px-5 py-2.5">Orders</th>
                <th className="text-right font-medium px-5 py-2.5">Gross</th>
                <th className="text-right font-medium px-5 py-2.5">Fee</th>
                <th className="text-right font-medium px-5 py-2.5">Refunds</th>
                <th className="text-right font-medium px-5 py-2.5">Net payout</th>
                <th className="text-left font-medium px-5 py-2.5">Status</th>
                <th className="text-left font-medium px-5 py-2.5">Bank ref</th>
                <th className="px-5 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {settlementsQ.isLoading && (
                <tr>
                  <td colSpan={9} className="px-5 py-8 text-center text-neutral-400">
                    Loading…
                  </td>
                </tr>
              )}
              {!settlementsQ.isLoading && settlements.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center text-neutral-500">
                    No settlements yet. Successful orders are batched and settled the next day.
                  </td>
                </tr>
              )}
              {settlements.map((s) => (
                <tr key={s.id} className="border-t border-neutral-100 hover:bg-neutral-50/60">
                  <td className="px-5 py-3 font-medium">{s.settlementDate}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{s.orderCount}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{rupees(s.grossPaise)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-neutral-500">
                    −{rupees(s.feePaise)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-neutral-500">
                    {s.refundPaise > 0 ? `−${rupees(s.refundPaise)}` : "—"}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold">
                    {rupees(s.netPaise)}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                        STATUS_TONE[s.status] ?? STATUS_TONE.PENDING
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-neutral-600">
                    {s.bankRef ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {s.status === "PENDING" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => payMut.mutate(s.id)}
                        disabled={payMut.isPending}
                      >
                        Mark paid
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="border border-neutral-200 bg-white rounded-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-neutral-200">
          <h2 className="font-medium text-sm">Ledger</h2>
          <p className="text-xs text-neutral-500">
            Double-entry journal. Every settlement debits gateway_payable and credits the merchant + fee accounts.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-neutral-500 bg-neutral-50">
              <tr>
                <th className="text-left font-medium px-5 py-2.5">When</th>
                <th className="text-left font-medium px-5 py-2.5">Account</th>
                <th className="text-left font-medium px-5 py-2.5">Description</th>
                <th className="text-right font-medium px-5 py-2.5">Debit</th>
                <th className="text-right font-medium px-5 py-2.5">Credit</th>
              </tr>
            </thead>
            <tbody>
              {(ledgerQ.data ?? []).slice(0, 50).map((e) => (
                <tr key={e.id} className="border-t border-neutral-100">
                  <td className="px-5 py-2.5 text-xs text-neutral-500">
                    {new Date(e.createdAt).toLocaleString("en-IN", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-5 py-2.5 font-mono text-xs">
                    {ACCOUNT_LABEL[e.account] ?? e.account}
                  </td>
                  <td className="px-5 py-2.5 text-neutral-600">{e.description}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">
                    {e.direction === "DEBIT" ? rupees(e.amountPaise) : ""}
                  </td>
                  <td className="px-5 py-2.5 text-right tabular-nums">
                    {e.direction === "CREDIT" ? rupees(e.amountPaise) : ""}
                  </td>
                </tr>
              ))}
              {(ledgerQ.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-neutral-500">
                    No ledger entries yet — they're written when settlements run.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}

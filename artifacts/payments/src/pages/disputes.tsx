import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertOctagon, Send, Gavel, Clock, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface Dispute {
  id: string;
  orderId: string;
  reason: string;
  amountPaise: number;
  status: string;
  evidenceText: string | null;
  evidenceUrl: string | null;
  resolutionNote: string | null;
  deadlineAt: string;
  submittedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

interface OrderRow {
  id: string;
  orderId: string;
  status: string;
}

function rupees(paise: number) {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });
}

const STATUS_META: Record<string, { tone: string; icon: typeof Clock; label: string }> = {
  OPEN: { tone: "bg-rose-50 text-rose-700 border-rose-200", icon: AlertOctagon, label: "Open — needs evidence" },
  UNDER_REVIEW: { tone: "bg-amber-50 text-amber-700 border-amber-200", icon: Gavel, label: "Under review" },
  WON: { tone: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2, label: "Won" },
  LOST: { tone: "bg-neutral-100 text-neutral-700 border-neutral-200", icon: XCircle, label: "Lost / chargeback" },
};

export default function Disputes() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Dispute | null>(null);
  const [evidence, setEvidence] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [createOrderId, setCreateOrderId] = useState("");
  const [createReason, setCreateReason] = useState("Customer claims service not delivered");

  const disputesQ = useQuery({
    queryKey: ["disputes"],
    queryFn: () => api<Dispute[]>("/disputes"),
    refetchInterval: 15_000,
  });

  const eligibleOrdersQ = useQuery({
    queryKey: ["orders", "for-dispute"],
    queryFn: () => api<OrderRow[]>("/orders", { query: { limit: 30 } }),
  });

  const submitMut = useMutation({
    mutationFn: (input: { id: string; text: string; url: string | null }) =>
      api<Dispute>(`/disputes/${input.id}/evidence`, {
        method: "POST",
        body: { text: input.text, url: input.url },
      }),
    onSuccess: (d) => {
      toast.success("Evidence submitted — under review");
      setSelected(d);
      setEvidence("");
      setEvidenceUrl("");
      qc.invalidateQueries({ queryKey: ["disputes"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Submission failed"),
  });

  const resolveMut = useMutation({
    mutationFn: (input: { id: string; outcome: "WON" | "LOST" }) =>
      api<Dispute>(`/disputes/${input.id}/resolve`, {
        method: "POST",
        body: { outcome: input.outcome },
      }),
    onSuccess: (d) => {
      toast.success(d.status === "WON" ? "Marked as won" : "Marked as lost");
      setSelected(d);
      qc.invalidateQueries({ queryKey: ["disputes"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Resolve failed"),
  });

  const createMut = useMutation({
    mutationFn: () =>
      api<Dispute>("/disputes", {
        method: "POST",
        body: { orderId: createOrderId, reason: createReason },
      }),
    onSuccess: () => {
      toast.success("Test dispute created");
      setCreateOrderId("");
      qc.invalidateQueries({ queryKey: ["disputes"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Create failed"),
  });

  const eligibleOrders = (eligibleOrdersQ.data ?? []).filter((o) => o.status === "SUCCESS");

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Disputes</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Customer-raised chargebacks. You have 7 days to submit evidence.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="border border-neutral-200 bg-white rounded-xl p-5"
      >
        <h2 className="text-sm font-medium mb-3">Simulate a dispute</h2>
        <p className="text-xs text-neutral-500 mb-3">
          In production, the gateway raises this via a webhook. Use this to test the flow on any successful order.
        </p>
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-neutral-500">Order</label>
            <select
              value={createOrderId}
              onChange={(e) => setCreateOrderId(e.target.value)}
              className="w-full h-9 px-2 mt-1 text-sm border border-neutral-200 rounded-md bg-white"
            >
              <option value="">Select a SUCCESS order…</option>
              {eligibleOrders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.orderId}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-neutral-500">Reason</label>
            <Input
              value={createReason}
              onChange={(e) => setCreateReason(e.target.value)}
              className="mt-1"
            />
          </div>
          <Button
            onClick={() => createMut.mutate()}
            disabled={!createOrderId || createMut.isPending}
            size="sm"
          >
            Raise dispute
          </Button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="border border-neutral-200 bg-white rounded-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-neutral-200">
          <h2 className="font-medium text-sm">All disputes</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-neutral-500 bg-neutral-50">
              <tr>
                <th className="text-left font-medium px-5 py-2.5">Reason</th>
                <th className="text-right font-medium px-5 py-2.5">Amount</th>
                <th className="text-left font-medium px-5 py-2.5">Status</th>
                <th className="text-left font-medium px-5 py-2.5">Deadline</th>
                <th className="text-left font-medium px-5 py-2.5">Raised</th>
                <th className="px-5 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {disputesQ.isLoading && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-neutral-400">
                    Loading…
                  </td>
                </tr>
              )}
              {!disputesQ.isLoading && (disputesQ.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-neutral-500">
                    No disputes — keep delivering the goods.
                  </td>
                </tr>
              )}
              {disputesQ.data?.map((d) => {
                const meta = STATUS_META[d.status] ?? STATUS_META.OPEN;
                const Icon = meta.icon;
                const overdue = new Date(d.deadlineAt).getTime() < Date.now() && d.status === "OPEN";
                return (
                  <tr
                    key={d.id}
                    className="border-t border-neutral-100 hover:bg-neutral-50/60 cursor-pointer"
                    onClick={() => {
                      setSelected(d);
                      setEvidence(d.evidenceText ?? "");
                      setEvidenceUrl(d.evidenceUrl ?? "");
                    }}
                  >
                    <td className="px-5 py-3 max-w-md truncate">{d.reason}</td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {rupees(d.amountPaise)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${meta.tone}`}
                      >
                        <Icon size={10} /> {meta.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs">
                      <span className={overdue ? "text-rose-600 font-medium" : "text-neutral-500"}>
                        {new Date(d.deadlineAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                        {overdue && " — overdue"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-neutral-500">
                      {new Date(d.createdAt).toLocaleString("en-IN", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-neutral-500">View →</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>

      <Sheet open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>Dispute on {rupees(selected.amountPaise)}</SheetTitle>
                <SheetDescription>{selected.reason}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-5 text-sm">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-neutral-500">Status</div>
                    <div className="font-medium mt-0.5">
                      {STATUS_META[selected.status]?.label ?? selected.status}
                    </div>
                  </div>
                  <div>
                    <div className="text-neutral-500">Deadline</div>
                    <div className="font-medium mt-0.5">
                      {new Date(selected.deadlineAt).toLocaleString("en-IN", {
                        dateStyle: "medium",
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="text-neutral-500">Raised</div>
                    <div className="font-medium mt-0.5">
                      {new Date(selected.createdAt).toLocaleString("en-IN", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="text-neutral-500">Submitted</div>
                    <div className="font-medium mt-0.5">
                      {selected.submittedAt
                        ? new Date(selected.submittedAt).toLocaleString("en-IN", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : "—"}
                    </div>
                  </div>
                </div>

                {selected.resolutionNote && (
                  <div className="border border-neutral-200 rounded-md p-3 bg-neutral-50">
                    <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
                      Resolution
                    </div>
                    <div className="text-sm">{selected.resolutionNote}</div>
                  </div>
                )}

                {(selected.status === "OPEN" || selected.status === "UNDER_REVIEW") && (
                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-neutral-500">
                      Your evidence
                    </label>
                    <Textarea
                      value={evidence}
                      onChange={(e) => setEvidence(e.target.value)}
                      rows={6}
                      placeholder="Describe what was delivered, attach proof links, ship tracking, etc."
                    />
                    <Input
                      placeholder="Optional URL (delivery receipt, screenshot…)"
                      value={evidenceUrl}
                      onChange={(e) => setEvidenceUrl(e.target.value)}
                    />
                    <Button
                      size="sm"
                      onClick={() =>
                        submitMut.mutate({
                          id: selected.id,
                          text: evidence,
                          url: evidenceUrl.trim() || null,
                        })
                      }
                      disabled={submitMut.isPending || evidence.trim().length < 20}
                    >
                      <Send size={14} className="mr-1.5" />
                      Submit evidence
                    </Button>
                  </div>
                )}

                {selected.status === "UNDER_REVIEW" && (
                  <div className="border-t border-neutral-200 pt-4">
                    <div className="text-xs uppercase tracking-wide text-neutral-500 mb-2">
                      Simulate bank decision (dev)
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resolveMut.mutate({ id: selected.id, outcome: "WON" })}
                        disabled={resolveMut.isPending}
                      >
                        <CheckCircle2 size={14} className="mr-1.5 text-emerald-600" />
                        Mark won
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resolveMut.mutate({ id: selected.id, outcome: "LOST" })}
                        disabled={resolveMut.isPending}
                      >
                        <XCircle size={14} className="mr-1.5 text-rose-600" />
                        Mark lost
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

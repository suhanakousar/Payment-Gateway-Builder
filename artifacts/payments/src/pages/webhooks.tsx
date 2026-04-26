import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  Send,
  Copy,
  Webhook,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

interface WebhookRow {
  id: string;
  webhookUrl: string;
  maskedSecret: string;
  enabled: boolean;
  createdAt: string;
}

interface WebhookLog {
  id: string;
  orderId: string;
  merchantWebhookId: string | null;
  event: string;
  attempt: number;
  status: string;
  requestBody: string;
  responseCode: number | null;
  responseBody: string | null;
  error: string | null;
  createdAt: string;
}

const newSchema = z.object({
  webhookUrl: z
    .string()
    .url("Must be a valid URL")
    .refine((v) => v.startsWith("https://") || v.startsWith("http://"), {
      message: "Must be http(s)",
    }),
});

type NewValues = z.infer<typeof newSchema>;

function NewWebhookDialog({
  open,
  onOpenChange,
  onSecretRevealed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSecretRevealed: (secret: string, url: string) => void;
}) {
  const qc = useQueryClient();
  const form = useForm<NewValues>({
    resolver: zodResolver(newSchema),
    defaultValues: { webhookUrl: "" },
  });
  const mutation = useMutation({
    mutationFn: (v: NewValues) =>
      api<{ id: string; webhookUrl: string; webhookSecret: string }>(
        "/merchant/webhooks",
        {
          method: "POST",
          body: v,
        },
      ),
    onSuccess: (res) => {
      onSecretRevealed(res.webhookSecret, res.webhookUrl);
      qc.invalidateQueries({ queryKey: ["webhooks"] });
      onOpenChange(false);
      form.reset();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add webhook</DialogTitle>
          <DialogDescription>
            We'll POST signed JSON events here whenever an order changes.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="webhookUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Endpoint URL</FormLabel>
                  <FormControl>
                    <Input placeholder="https://yourapp.com/webhooks/paylite" {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Public URLs only. Local and private network addresses are blocked.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 size={14} className="mr-1 animate-spin" />}
                Create webhook
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function SecretRevealDialog({
  data,
  onClose,
}: {
  data: { secret: string; url: string } | null;
  onClose: () => void;
}) {
  const open = data !== null;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save your signing secret</DialogTitle>
          <DialogDescription>
            This secret is shown only once. We use it to sign every event POSTed to your endpoint.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <div className="text-xs text-neutral-500 mb-1">URL</div>
            <div className="font-mono text-xs break-all border border-neutral-200 rounded-md p-2 bg-neutral-50">
              {data?.url}
            </div>
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-1">Signing secret</div>
            <div className="flex gap-2">
              <div className="flex-1 font-mono text-xs break-all border border-neutral-200 rounded-md p-2 bg-neutral-50">
                {data?.secret}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (data) {
                    navigator.clipboard.writeText(data.secret);
                    toast.success("Copied");
                  }
                }}
              >
                <Copy size={14} />
              </Button>
            </div>
          </div>
          <p className="text-xs text-neutral-500">
            Verify deliveries by HMAC-SHA256 using the{" "}
            <code className="font-mono">X-PayLite-Signature</code> header.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>I've saved it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const LOG_TONE: Record<string, string> = {
  SENT: "text-emerald-700 bg-emerald-50 border-emerald-200",
  RETRY: "text-amber-700 bg-amber-50 border-amber-200",
  FAILED: "text-rose-700 bg-rose-50 border-rose-200",
};

function prettyJson(s: string | null): string {
  if (!s) return "(empty)";
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

export default function Webhooks() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reveal, setReveal] = useState<{ secret: string; url: string } | null>(null);
  const [activeLog, setActiveLog] = useState<WebhookLog | null>(null);

  const webhooksQuery = useQuery({
    queryKey: ["webhooks"],
    queryFn: () => api<WebhookRow[]>("/merchant/webhooks"),
  });
  const logsQuery = useQuery({
    queryKey: ["webhook-logs"],
    queryFn: () => api<WebhookLog[]>("/merchant/webhook-logs", { query: { limit: 50 } }),
    refetchInterval: 10_000,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`/merchant/webhooks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Webhook removed");
      qc.invalidateQueries({ queryKey: ["webhooks"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Delete failed"),
  });

  const testMut = useMutation({
    mutationFn: (id: string) =>
      api<{ ok: boolean; status: number | null; error: string | null }>(
        `/merchant/webhooks/${id}/test`,
        { method: "POST" },
      ),
    onSuccess: (r) => {
      if (r.ok) toast.success(`Test delivered (HTTP ${r.status})`);
      else toast.error(r.error ?? "Test failed");
      qc.invalidateQueries({ queryKey: ["webhook-logs"] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Test failed"),
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Get notified when orders are paid, fail, or are refunded.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus size={14} className="mr-1.5" /> Add webhook
        </Button>
      </div>

      <NewWebhookDialog
        open={open}
        onOpenChange={setOpen}
        onSecretRevealed={(secret, url) => setReveal({ secret, url })}
      />
      <SecretRevealDialog data={reveal} onClose={() => setReveal(null)} />

      <div className="border border-neutral-200 bg-white rounded-xl">
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center gap-2">
          <Webhook size={14} className="text-neutral-500" />
          <h2 className="text-sm font-medium">Endpoints</h2>
        </div>
        <div className="divide-y divide-neutral-100">
          {webhooksQuery.isLoading && (
            <div className="px-5 py-10 text-center text-neutral-400 text-sm">Loading…</div>
          )}
          {!webhooksQuery.isLoading && webhooksQuery.data?.length === 0 && (
            <div className="px-5 py-12 text-center text-neutral-500 text-sm">
              No webhooks yet. Add one to start receiving events.
            </div>
          )}
          <AnimatePresence initial={false}>
            {webhooksQuery.data?.map((w) => (
              <motion.div
                key={w.id}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-mono text-sm text-neutral-900 truncate">
                    {w.webhookUrl}
                  </div>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    Secret <span className="font-mono">{w.maskedSecret}</span> · added{" "}
                    {new Date(w.createdAt).toLocaleDateString("en-IN", {
                      dateStyle: "medium",
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => testMut.mutate(w.id)}
                    disabled={testMut.isPending}
                  >
                    <Send size={12} className="mr-1" /> Test
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (confirm("Remove this webhook?")) deleteMut.mutate(w.id);
                    }}
                  >
                    <Trash2 size={12} className="mr-1" /> Delete
                  </Button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <div className="border border-neutral-200 bg-white rounded-xl">
        <div className="px-5 py-4 border-b border-neutral-200">
          <h2 className="text-sm font-medium">Recent delivery attempts</h2>
          <p className="text-xs text-neutral-500">
            Click any row to inspect the signed payload and response. Auto-refreshes every 10s · last 50.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-neutral-500 bg-neutral-50">
              <tr>
                <th className="text-left font-medium px-5 py-2.5">Status</th>
                <th className="text-left font-medium px-5 py-2.5">Event</th>
                <th className="text-left font-medium px-5 py-2.5">Order</th>
                <th className="text-left font-medium px-5 py-2.5">Attempt</th>
                <th className="text-left font-medium px-5 py-2.5">HTTP</th>
                <th className="text-left font-medium px-5 py-2.5">Detail</th>
                <th className="text-left font-medium px-5 py-2.5">When</th>
              </tr>
            </thead>
            <tbody>
              {logsQuery.isLoading && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-neutral-400">
                    Loading…
                  </td>
                </tr>
              )}
              {!logsQuery.isLoading && logsQuery.data?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-neutral-500">
                    No deliveries yet.
                  </td>
                </tr>
              )}
              {logsQuery.data?.map((l) => (
                <tr
                  key={l.id}
                  className="border-t border-neutral-100 hover:bg-neutral-50/60 cursor-pointer"
                  onClick={() => setActiveLog(l)}
                >
                  <td className="px-5 py-2.5">
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${
                        LOG_TONE[l.status] ?? ""
                      }`}
                    >
                      {l.status === "SENT" && <CheckCircle2 size={10} />}
                      {l.status === "RETRY" && <Clock size={10} />}
                      {l.status === "FAILED" && <XCircle size={10} />}
                      {l.status}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 font-mono text-xs">{l.event}</td>
                  <td className="px-5 py-2.5 font-mono text-xs">{l.orderId.slice(0, 8)}…</td>
                  <td className="px-5 py-2.5 text-xs">#{l.attempt}</td>
                  <td className="px-5 py-2.5 text-xs">{l.responseCode ?? "—"}</td>
                  <td className="px-5 py-2.5 text-xs text-neutral-600 truncate max-w-xs">
                    {l.error ?? "delivered"}
                  </td>
                  <td className="px-5 py-2.5 text-xs text-neutral-500">
                    {new Date(l.createdAt).toLocaleTimeString("en-IN", { hour12: false })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet open={!!activeLog} onOpenChange={(v) => !v && setActiveLog(null)}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          {activeLog && (
            <>
              <SheetHeader>
                <SheetTitle>
                  <span className="font-mono text-sm">{activeLog.event}</span>
                </SheetTitle>
                <SheetDescription>
                  Attempt #{activeLog.attempt} · {activeLog.status}
                  {activeLog.responseCode !== null && ` · HTTP ${activeLog.responseCode}`}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-5 text-sm">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-neutral-500">Order</div>
                    <div className="font-mono mt-0.5">{activeLog.orderId.slice(0, 12)}…</div>
                  </div>
                  <div>
                    <div className="text-neutral-500">When</div>
                    <div className="mt-0.5">
                      {new Date(activeLog.createdAt).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "medium",
                      })}
                    </div>
                  </div>
                </div>

                {activeLog.error && (
                  <div className="border border-rose-200 bg-rose-50 rounded-md p-3 text-xs text-rose-800">
                    <div className="font-medium mb-1">Delivery error</div>
                    <div>{activeLog.error}</div>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs uppercase tracking-wide text-neutral-500">
                      Request payload
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(activeLog.requestBody ?? "");
                        toast.success("Copied");
                      }}
                    >
                      <Copy size={12} />
                    </Button>
                  </div>
                  <pre className="text-[11px] font-mono leading-relaxed border border-neutral-200 rounded-md p-3 bg-neutral-50 overflow-x-auto max-h-64">
                    {prettyJson(activeLog.requestBody)}
                  </pre>
                </div>

                <div>
                  <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">
                    Response body
                  </div>
                  <pre className="text-[11px] font-mono leading-relaxed border border-neutral-200 rounded-md p-3 bg-neutral-50 overflow-x-auto max-h-48">
                    {activeLog.responseBody && activeLog.responseBody.length > 0
                      ? activeLog.responseBody
                      : "(no response body)"}
                  </pre>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

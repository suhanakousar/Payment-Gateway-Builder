import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Search,
  Download,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { api, apiBlob, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

interface OrderRow {
  id: string;
  orderId: string;
  txnId: string | null;
  amount: number;
  status: string;
  customerName: string | null;
  customerEmail: string | null;
  note: string | null;
  fraudFlag: boolean;
  fraudReason: string | null;
  refundStatus: string | null;
  createdAt: string;
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

const newOrderSchema = z.object({
  orderId: z.string().min(1, "Order ID required").max(64),
  amount: z.coerce.number().positive("Must be > 0").max(1_000_000),
  customerName: z.string().max(120).optional().or(z.literal("")),
  customerEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  note: z.string().max(280).optional().or(z.literal("")),
});

type NewOrderValues = z.infer<typeof newOrderSchema>;

function NewOrderDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const { merchant } = useAuth();
  const form = useForm<NewOrderValues>({
    resolver: zodResolver(newOrderSchema),
    defaultValues: {
      orderId: `ORD-${Date.now().toString(36).toUpperCase()}`,
      amount: 100,
      customerName: "",
      customerEmail: "",
      note: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: NewOrderValues) =>
      api<{ order: OrderRow; qrImage: string }>("/orders", {
        method: "POST",
        body: {
          orderId: values.orderId,
          amount: values.amount,
          customerName: values.customerName || undefined,
          customerEmail: values.customerEmail || undefined,
          note: values.note || undefined,
        },
      }),
    onSuccess: (res) => {
      toast.success(`Order ${res.order.orderId} created`);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
      form.reset({
        orderId: `ORD-${Date.now().toString(36).toUpperCase()}`,
        amount: 100,
        customerName: "",
        customerEmail: "",
        note: "",
      });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof ApiError ? e.message : "Failed to create order");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New order</DialogTitle>
        </DialogHeader>
        {!merchant?.providerVpa && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Add the merchant UPI ID in <code>KYC &amp; bank -&gt; Provider mapping</code> before creating QR orders.
          </div>
        )}
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="orderId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Order ID</FormLabel>
                  <FormControl>
                    <Input {...field} className="font-mono" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount (₹)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer name</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customerEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer email</FormLabel>
                    <FormControl><Input type="email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending || !merchant?.providerVpa}
              >
                {mutation.isPending ? "Creating…" : "Create order"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function RefundButton({ order }: { order: OrderRow }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      api<{ status: string }>(`/orders/${order.id}/refund`, { method: "POST", body: {} }),
    onSuccess: (res) => {
      toast.success(`Refund ${res.status.toLowerCase()}`);
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setOpen(false);
    },
    onError: (e) => {
      toast.error(e instanceof ApiError ? e.message : "Refund failed");
    },
  });

  if (order.status !== "SUCCESS" || order.refundStatus === "SUCCESS") return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs">
          <RefreshCw size={12} className="mr-1" /> Refund
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Refund order?</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-neutral-600">
          This refunds the full amount of{" "}
          <span className="font-medium text-neutral-900">
            ₹{order.amount.toLocaleString("en-IN")}
          </span>{" "}
          for{" "}
          <span className="font-mono text-xs">{order.orderId}</span>.
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 size={14} className="mr-1 animate-spin" />}
            Confirm refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Orders() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("ALL");
  const [open, setOpen] = useState(false);

  const filters = useMemo(
    () => ({
      search: search.trim() || undefined,
      status: status === "ALL" ? undefined : status,
      limit: 100,
    }),
    [search, status],
  );

  const ordersQuery = useQuery({
    queryKey: ["orders", filters],
    queryFn: () => api<OrderRow[]>("/orders", { query: filters }),
    placeholderData: (prev) => prev,
  });

  async function handleExport() {
    try {
      const { blob, filename } = await apiBlob("/orders/export", filters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename ?? "orders.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("CSV downloaded");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Export failed");
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Search, filter, refund, and export your payment activity.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download size={14} className="mr-1.5" /> Export CSV
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus size={14} className="mr-1.5" /> New order
          </Button>
        </div>
      </div>

      <NewOrderDialog open={open} onOpenChange={setOpen} />

      <div className="border border-neutral-200 bg-white rounded-xl">
        <div className="p-4 border-b border-neutral-200 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by order ID, customer, email or note…"
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="SUCCESS">Success</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="EXPIRED">Expired</SelectItem>
              <SelectItem value="REFUNDED">Refunded</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wide text-neutral-500 bg-neutral-50">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Order</th>
                <th className="text-left font-medium px-4 py-2.5">Customer</th>
                <th className="text-right font-medium px-4 py-2.5">Amount</th>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
                <th className="text-left font-medium px-4 py-2.5">When</th>
                <th className="text-right font-medium px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {ordersQuery.isLoading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-neutral-400">
                      Loading…
                    </td>
                  </tr>
                )}
                {!ordersQuery.isLoading && ordersQuery.data?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-neutral-500">
                      No orders match your filters.
                    </td>
                  </tr>
                )}
                {ordersQuery.data?.map((o, i) => (
                  <motion.tr
                    key={o.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.015 }}
                    className="border-t border-neutral-100 hover:bg-neutral-50/60"
                  >
                    <td className="px-4 py-3 font-mono text-xs">
                      <div className="flex items-center gap-2">
                        <Link href={`/payment/${o.id}`}>
                          <span className="cursor-pointer hover:underline flex items-center gap-1">
                            {o.orderId}
                            <ExternalLink size={10} className="text-neutral-400" />
                          </span>
                        </Link>
                        {o.fraudFlag && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-rose-600 border border-rose-200 bg-rose-50 px-1.5 py-0.5 rounded" title={o.fraudReason ?? "Fraud flag"}>
                            <AlertTriangle size={9} /> flagged
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">
                      <div>{o.customerName ?? "—"}</div>
                      {o.customerEmail && (
                        <div className="text-xs text-neutral-500">{o.customerEmail}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      ₹{o.amount.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StatusPill value={o.status} />
                        {o.refundStatus && (
                          <span className="text-[10px] text-violet-700">
                            refund: {o.refundStatus.toLowerCase()}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-500 text-xs">
                      {new Date(o.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RefundButton order={o} />
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

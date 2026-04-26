import { useEffect, useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  ShieldCheck,
  Lock,
  Upload,
  FileText,
  Trash2,
  Check,
  Clock,
  AlertCircle,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const schema = z.object({
  pan: z
    .string()
    .min(5, "PAN looks too short")
    .max(20, "PAN looks too long")
    .regex(/^[A-Z0-9]+$/i, "Use letters and digits only"),
  bankAccount: z
    .string()
    .min(6, "Account number too short")
    .max(20, "Account number too long")
    .regex(/^\d+$/, "Digits only"),
  ifsc: z
    .string()
    .min(6, "IFSC too short")
    .max(15, "IFSC too long")
    .regex(/^[A-Z0-9]+$/i, "Use letters and digits only"),
});

type Values = z.infer<typeof schema>;

interface KycDoc {
  id: string;
  docType: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageUrl: string;
  createdAt: string;
}

const DOC_TYPES = [
  { value: "PAN", label: "PAN card" },
  { value: "AADHAAR", label: "Aadhaar" },
  { value: "CHEQUE", label: "Cancelled cheque" },
  { value: "GST", label: "GST certificate" },
  { value: "OTHER", label: "Other" },
] as const;

const STEPS = [
  { key: "details", label: "Business details" },
  { key: "documents", label: "Upload documents" },
  { key: "review", label: "Review & submit" },
] as const;

const STATUS_BLOCK: Record<
  string,
  { tone: string; icon: typeof Check; title: string; body: string }
> = {
  NOT_STARTED: {
    tone: "border-neutral-200 bg-neutral-50 text-neutral-700",
    icon: AlertCircle,
    title: "Get verified to start accepting larger payments",
    body: "Complete the 3 steps below. We approve standard cases within minutes.",
  },
  SUBMITTED: {
    tone: "border-amber-200 bg-amber-50 text-amber-800",
    icon: Clock,
    title: "Submitted — waiting for review",
    body: "Our team is checking your details. We'll usually finish within an hour.",
  },
  UNDER_REVIEW: {
    tone: "border-amber-200 bg-amber-50 text-amber-800",
    icon: Clock,
    title: "Under review by compliance",
    body: "No action needed from your side right now.",
  },
  APPROVED: {
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
    icon: Check,
    title: "KYC approved",
    body: "You can accept payments of any amount and receive daily payouts.",
  },
  VERIFIED: {
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
    icon: Check,
    title: "Verified",
    body: "You're all set.",
  },
  REJECTED: {
    tone: "border-rose-200 bg-rose-50 text-rose-800",
    icon: AlertCircle,
    title: "KYC was rejected",
    body: "Please correct the issue noted below and resubmit.",
  },
};

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

async function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function Kyc() {
  const { merchant, refresh } = useAuth();
  const qc = useQueryClient();
  const [previousMasked, setPreviousMasked] = useState<{
    pan: string | null;
    bankAccount: string | null;
    ifsc: string | null;
  } | null>(null);
  const [docType, setDocType] = useState<string>("PAN");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { pan: "", bankAccount: "", ifsc: "" },
  });

  useEffect(() => {
    if (merchant) {
      setPreviousMasked({
        pan: merchant.pan,
        bankAccount: merchant.bankAccount,
        ifsc: merchant.ifsc,
      });
    }
  }, [merchant]);

  const docsQ = useQuery({
    queryKey: ["kyc", "docs"],
    queryFn: () => api<KycDoc[]>("/merchant/kyc/docs"),
    refetchInterval: (q) => {
      const status = merchant?.kycStatus;
      return status === "SUBMITTED" || status === "UNDER_REVIEW" ? 3000 : false;
    },
  });

  // Auto-refresh merchant when KYC is being processed.
  useEffect(() => {
    const status = merchant?.kycStatus;
    if (status !== "SUBMITTED" && status !== "UNDER_REVIEW") return;
    const t = setInterval(() => refresh(), 3000);
    return () => clearInterval(t);
  }, [merchant?.kycStatus, refresh]);

  const saveMut = useMutation({
    mutationFn: (values: Values) =>
      api<{ merchant: unknown }>("/merchant/kyc", { method: "PUT", body: values }),
    onSuccess: async () => {
      toast.success("Details saved — now upload your documents");
      await refresh();
      form.reset({ pan: "", bankAccount: "", ifsc: "" });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Save failed"),
  });

  const deleteDocMut = useMutation({
    mutationFn: (id: string) =>
      api(`/merchant/kyc/docs/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Document removed");
      qc.invalidateQueries({ queryKey: ["kyc", "docs"] });
    },
  });

  async function handleFile(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Files must be under 2 MB");
      return;
    }
    setUploading(true);
    try {
      const dataUri = await fileToDataUri(file);
      await api<KycDoc>("/merchant/kyc/docs", {
        method: "POST",
        body: { docType, filename: file.name, dataUri },
      });
      toast.success(`${file.name} uploaded`);
      qc.invalidateQueries({ queryKey: ["kyc", "docs"] });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const status = merchant?.kycStatus ?? "NOT_STARTED";
  const meta = STATUS_BLOCK[status] ?? STATUS_BLOCK.NOT_STARTED;
  const StatusIcon = meta.icon;
  const docs = docsQ.data ?? [];
  const hasDetails = !!previousMasked?.pan;
  const hasDocs = docs.length > 0;
  const isComplete = status === "APPROVED" || status === "VERIFIED";

  const stepStates: Array<"complete" | "active" | "pending"> = [
    hasDetails ? "complete" : "active",
    hasDetails ? (hasDocs ? "complete" : "active") : "pending",
    isComplete ? "complete" : hasDetails && hasDocs ? "active" : "pending",
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">KYC & bank</h1>
        <p className="text-sm text-neutral-500 mt-1">
          We need this to settle payouts and stay compliant with RBI rules.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={`border rounded-xl p-5 flex items-start gap-3 ${meta.tone}`}
      >
        <StatusIcon size={18} className="shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-medium">{meta.title}</div>
          <div className="text-xs mt-0.5 opacity-80">{meta.body}</div>
          {merchant?.kycRejectionReason && status === "REJECTED" && (
            <div className="text-xs mt-2 font-medium">
              Reason: {merchant.kycRejectionReason}
            </div>
          )}
        </div>
      </motion.div>

      {/* Stepper */}
      <div className="flex items-center justify-between gap-2">
        {STEPS.map((s, i) => {
          const state = stepStates[i];
          return (
            <div key={s.key} className="flex-1 flex items-center gap-2">
              <div
                className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold ${
                  state === "complete"
                    ? "bg-emerald-600 text-white"
                    : state === "active"
                      ? "bg-neutral-900 text-white"
                      : "bg-neutral-200 text-neutral-500"
                }`}
              >
                {state === "complete" ? <Check size={14} /> : i + 1}
              </div>
              <span
                className={`text-xs font-medium ${
                  state === "pending" ? "text-neutral-400" : "text-neutral-900"
                }`}
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-px ${
                    stepStates[i] === "complete" ? "bg-emerald-300" : "bg-neutral-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step 1: details */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="border border-neutral-200 bg-white rounded-xl p-5"
      >
        <div className="flex items-center gap-2 mb-1">
          <Lock size={14} className="text-neutral-500" />
          <h2 className="text-sm font-medium">Step 1 — Business details</h2>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Encrypted with AES-256-GCM at rest. Only the last 4 chars are ever shown again.
        </p>

        {hasDetails && (
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm mb-4 p-3 rounded-md bg-neutral-50">
            <div>
              <dt className="text-xs uppercase tracking-wide text-neutral-500">PAN</dt>
              <dd className="font-mono mt-0.5">{previousMasked?.pan ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-neutral-500">Account</dt>
              <dd className="font-mono mt-0.5">{previousMasked?.bankAccount ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-neutral-500">IFSC</dt>
              <dd className="font-mono mt-0.5">{previousMasked?.ifsc ?? "—"}</dd>
            </div>
          </dl>
        )}

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => saveMut.mutate(v))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="pan"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>PAN</FormLabel>
                  <FormControl>
                    <Input
                      className="font-mono uppercase"
                      placeholder="ABCDE1234F"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    10-character permanent account number.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="bankAccount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bank account</FormLabel>
                    <FormControl>
                      <Input
                        className="font-mono"
                        placeholder="1234567890"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ifsc"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>IFSC</FormLabel>
                    <FormControl>
                      <Input
                        className="font-mono uppercase"
                        placeholder="HDFC0001234"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" disabled={saveMut.isPending}>
              <ShieldCheck size={14} className="mr-1.5" />
              {saveMut.isPending ? "Saving…" : hasDetails ? "Update details" : "Save details"}
            </Button>
          </form>
        </Form>
      </motion.div>

      {/* Step 2: documents */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="border border-neutral-200 bg-white rounded-xl p-5"
      >
        <div className="flex items-center gap-2 mb-1">
          <Upload size={14} className="text-neutral-500" />
          <h2 className="text-sm font-medium">Step 2 — Upload supporting documents</h2>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          PAN card and a cancelled cheque are required. PDF, JPG or PNG up to 2 MB each.
        </p>

        <div className="flex gap-2 flex-wrap items-end mb-4">
          <div>
            <label className="text-xs text-neutral-500">Document type</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="block mt-1 h-9 px-2 text-sm border border-neutral-200 rounded-md bg-white"
            >
              {DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,application/pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
            className="hidden"
          />
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <Upload size={14} className="mr-1.5" />
            {uploading ? "Uploading…" : "Choose file"}
          </Button>
        </div>

        {docs.length === 0 ? (
          <div className="text-sm text-neutral-500 text-center py-6 border border-dashed rounded-md">
            No documents uploaded yet.
          </div>
        ) : (
          <ul className="space-y-2">
            {docs.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 border border-neutral-200 rounded-md px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText size={16} className="text-neutral-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{d.filename}</div>
                    <div className="text-xs text-neutral-500">
                      {DOC_TYPES.find((t) => t.value === d.docType)?.label ?? d.docType}{" "}
                      · {formatBytes(d.sizeBytes)} · uploaded{" "}
                      {new Date(d.createdAt).toLocaleString("en-IN", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteDocMut.mutate(d.id)}
                  disabled={status === "APPROVED" || status === "VERIFIED"}
                >
                  <Trash2 size={14} className="text-rose-500" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </motion.div>

      {/* Step 3: review */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="border border-neutral-200 bg-white rounded-xl p-5"
      >
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={14} className="text-neutral-500" />
          <h2 className="text-sm font-medium">Step 3 — Review</h2>
        </div>
        <p className="text-xs text-neutral-500">
          {!hasDetails
            ? "Complete step 1 first."
            : !hasDocs
              ? "Upload at least one document in step 2."
              : isComplete
                ? "All done — your account is fully verified."
                : "We're reviewing automatically. This page will update when complete."}
        </p>
      </motion.div>
    </div>
  );
}

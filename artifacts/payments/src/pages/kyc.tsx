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
  CheckCircle2,
  RefreshCw,
  Info,
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
  pan: z.string().min(5, "PAN looks too short").max(20, "PAN looks too long").regex(/^[A-Z0-9]+$/i, "Use letters and digits only"),
  bankAccount: z.string().min(6, "Account number too short").max(20, "Account number too long").regex(/^\d+$/, "Digits only"),
  bankAccountHolderName: z.string().min(2, "Holder name required").max(120, "Holder name too long"),
  ifsc: z.string().min(6, "IFSC too short").max(15, "IFSC too long").regex(/^[A-Z0-9]+$/i, "Use letters and digits only"),
});

const providerSchema = z.object({
  preferredProvider: z.string().min(2, "Provider required").max(40),
  providerVpa: z
    .string()
    .max(120)
    .regex(/^[a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+$/, "Enter a valid UPI ID (e.g. name@bank)")
    .or(z.literal("")),
});

type Values = z.infer<typeof schema>;
type ProviderValues = z.infer<typeof providerSchema>;

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
] as const;

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to read file"));
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function BeneficiaryStatus({
  providerMerchantId,
  providerStatus,
  providerVpa,
  onRegister,
  registering,
}: {
  providerMerchantId: string | null;
  providerStatus: string;
  providerVpa: string | null;
  onRegister: () => void;
  registering: boolean;
}) {
  const isRegistered = Boolean(providerMerchantId) && providerStatus === "ACTIVE";
  const isPending = Boolean(providerMerchantId) && providerStatus === "PENDING";

  if (isRegistered) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 flex items-start gap-2.5">
        <CheckCircle2 size={15} className="text-emerald-600 mt-0.5 shrink-0" />
        <div className="text-xs text-emerald-800 space-y-0.5">
          <div className="font-medium">Payment account registered</div>
          <div className="font-mono text-emerald-700 break-all">{providerMerchantId}</div>
          <div className="opacity-70">QR codes will route payments to this beneficiary ID.</div>
        </div>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2.5">
        <Clock size={15} className="text-amber-600 mt-0.5 shrink-0" />
        <div className="text-xs text-amber-800 space-y-1">
          <div className="font-medium">Beneficiary registration pending</div>
          <div>Decentro is verifying your account. This usually takes a few minutes.</div>
          <Button size="sm" variant="outline" onClick={onRegister} disabled={registering} className="h-6 text-xs px-2">
            {registering ? <RefreshCw size={10} className="animate-spin mr-1" /> : null}
            Retry registration
          </Button>
        </div>
      </div>
    );
  }

  // Not yet registered
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 flex items-start gap-2.5">
      <Info size={15} className="text-neutral-500 mt-0.5 shrink-0" />
      <div className="text-xs text-neutral-700 space-y-1.5">
        <div className="font-medium">Payment account not yet registered</div>
        <div>
          {providerVpa
            ? `Save your UPI ID to automatically register "${providerVpa}" as a Decentro beneficiary. QR codes will use this account.`
            : "Enter your receiving UPI ID below and save to register it as a payment receiver with Decentro."}
        </div>
      </div>
    </div>
  );
}

export default function KycPage() {
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
  const providerFormInitialized = useRef(false);
  const [registeringBeneficiary, setRegisteringBeneficiary] = useState(false);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { pan: "", bankAccount: "", bankAccountHolderName: "", ifsc: "" },
  });

  const providerForm = useForm<ProviderValues>({
    resolver: zodResolver(providerSchema),
    defaultValues: {
      preferredProvider: merchant?.preferredProvider ?? "decentro",
      providerVpa: merchant?.providerVpa ?? "",
    },
  });

  useEffect(() => {
    if (merchant) {
      setPreviousMasked({
        pan: merchant.pan,
        bankAccount: merchant.bankAccount,
        ifsc: merchant.ifsc,
      });
      if (!providerFormInitialized.current) {
        providerFormInitialized.current = true;
        providerForm.reset({
          preferredProvider: merchant.preferredProvider ?? "decentro",
          providerVpa: merchant.providerVpa ?? "",
        });
      }
    }
  }, [merchant, providerForm]);

  const docsQ = useQuery({
    queryKey: ["kyc", "docs"],
    queryFn: () => api<KycDoc[]>("/merchant/kyc/docs"),
    refetchInterval: () => {
      const status = merchant?.kycStatus;
      return status === "SUBMITTED" || status === "UNDER_REVIEW" ? 3000 : false;
    },
  });

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
      form.reset({ pan: "", bankAccount: "", bankAccountHolderName: "", ifsc: "" });
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

  const providerMut = useMutation({
    mutationFn: (values: ProviderValues) =>
      api<{ merchant: unknown }>("/merchant/provider-config", {
        method: "PUT",
        body: {
          preferredProvider: values.preferredProvider,
          providerVpa: values.providerVpa || undefined,
        },
      }),
    onSuccess: async () => {
      toast.success("UPI ID saved — registering payment account…");
      // Poll for beneficiary registration completion
      let attempts = 0;
      const poll = setInterval(async () => {
        await refresh();
        attempts++;
        if (attempts >= 10) clearInterval(poll);
      }, 2000);
      await refresh();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Provider settings failed"),
  });

  async function handleRegisterBeneficiary() {
    if (!merchant?.providerVpa) {
      toast.error("Save your UPI ID first");
      return;
    }
    setRegisteringBeneficiary(true);
    try {
      await api<{ merchant: unknown }>("/merchant/provider-config", {
        method: "PUT",
        body: {
          preferredProvider: merchant.preferredProvider ?? "decentro",
          providerVpa: merchant.providerVpa,
        },
      });
      toast.success("Re-registering payment account…");
      await refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Registration failed");
    } finally {
      setRegisteringBeneficiary(false);
    }
  }

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
    }
  }

  if (!merchant) return null;

  const isComplete = merchant.kycStatus === "APPROVED" || merchant.kycStatus === "VERIFIED";
  const hasDetails = Boolean(previousMasked?.pan || previousMasked?.bankAccount || previousMasked?.ifsc);

  return (
    <div className="space-y-6">
      {/* ── Receiving UPI / Beneficiary section ── */}
      <motion.div className="border border-neutral-200 bg-white rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={14} className="text-neutral-500" />
          <h2 className="text-sm font-medium">Receiving UPI ID</h2>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          This is where payments land. Saving your UPI ID registers it with Decentro so every QR code generated routes to the correct account.
        </p>

        <BeneficiaryStatus
          providerMerchantId={merchant.providerMerchantId}
          providerStatus={merchant.providerStatus ?? ""}
          providerVpa={merchant.providerVpa}
          onRegister={handleRegisterBeneficiary}
          registering={registeringBeneficiary}
        />

        <Form {...providerForm}>
          <form
            onSubmit={providerForm.handleSubmit((v) => providerMut.mutate(v))}
            className="space-y-4 mt-4"
          >
            <FormField
              control={providerForm.control}
              name="providerVpa"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Your receiving UPI ID</FormLabel>
                  <FormControl>
                    <Input
                      className="font-mono"
                      placeholder="yourname@okicici"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Example: <code>yourname@okicici</code>, <code>business@ybl</code>. This is registered as a Decentro beneficiary when you save.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={providerMut.isPending}>
                {providerMut.isPending ? (
                  <>
                    <RefreshCw size={12} className="animate-spin mr-1.5" />
                    Registering…
                  </>
                ) : "Save & register UPI ID"}
              </Button>
              {merchant.providerVpa && (
                <span className="text-xs text-neutral-500 font-mono">
                  Saved: {merchant.providerVpa}
                </span>
              )}
            </div>
          </form>
        </Form>
      </motion.div>

      {/* ── KYC & bank details ── */}
      <motion.div className="border border-neutral-200 bg-white rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Lock size={14} className="text-neutral-500" />
          <h2 className="text-sm font-medium">KYC & bank details</h2>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Required for settlement and RBI compliance. This triggers KYC review.
        </p>

        {isComplete && (
          <div className="border rounded-xl p-3.5 flex items-start gap-3 border-emerald-200 bg-emerald-50 text-emerald-900 mb-4">
            <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-medium">KYC approved</div>
              <div className="text-xs mt-0.5 opacity-80">
                Your identity is verified. Bank details are on file.
              </div>
            </div>
          </div>
        )}

        {isComplete && merchant.providerStatus !== "ACTIVE" && (
          <div className="border rounded-xl p-3.5 flex items-start gap-3 border-amber-200 bg-amber-50 text-amber-900 mb-4">
            <Clock size={16} className="shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-medium">Payment provider activation in progress</div>
              <div className="text-xs mt-0.5 opacity-80">
                {merchant.providerStatus ? `Status: ${merchant.providerStatus}. ` : ""}
                Usually a few minutes. Once active, you can accept live payments.
              </div>
            </div>
          </div>
        )}

        {!isComplete && (
          <>
            {hasDetails && (
              <div className="border rounded-xl p-3.5 flex items-center gap-2 border-neutral-200 bg-neutral-50 text-neutral-600 mb-4">
                <Clock size={14} className="shrink-0" />
                <div className="text-xs">
                  Details saved · Status: <span className="font-medium">{merchant.kycStatus}</span>
                  {(merchant.kycStatus === "SUBMITTED" || merchant.kycStatus === "UNDER_REVIEW") && " — checking…"}
                </div>
              </div>
            )}
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((v) => saveMut.mutate(v))}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="pan"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>PAN</FormLabel>
                        <FormControl>
                          <Input
                            className="font-mono uppercase"
                            placeholder={previousMasked?.pan ?? "ABCDE1234F"}
                            {...field}
                            onChange={(e) => field.onChange(e.target.value.toUpperCase())}
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
                        <FormLabel>IFSC code</FormLabel>
                        <FormControl>
                          <Input
                            className="font-mono uppercase"
                            placeholder={previousMasked?.ifsc ?? "HDFC0001234"}
                            {...field}
                            onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="bankAccountHolderName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account holder name</FormLabel>
                      <FormControl>
                        <Input placeholder="As on bank records" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bankAccount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank account number</FormLabel>
                      <FormControl>
                        <Input
                          className="font-mono"
                          placeholder={previousMasked?.bankAccount ?? "Account number"}
                          type="text"
                          inputMode="numeric"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={saveMut.isPending}>
                  {saveMut.isPending ? "Saving…" : "Save KYC details"}
                </Button>
              </form>
            </Form>
          </>
        )}
      </motion.div>

      {/* ── Upload documents ── */}
      <motion.div className="border border-neutral-200 bg-white rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Upload size={14} className="text-neutral-500" />
          <h2 className="text-sm font-medium">Supporting documents</h2>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Upload PAN card, cancelled cheque, and other KYC documents.
        </p>

        <div className="flex items-center gap-3 mb-4">
          <select
            className="text-sm border border-neutral-200 rounded-md px-2.5 py-1.5 bg-white"
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
          >
            {DOC_TYPES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={12} className="mr-1.5" />
            {uploading ? "Uploading…" : "Choose file"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,application/pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void handleFile(file);
                e.target.value = "";
              }
            }}
          />
        </div>

        {docsQ.data && docsQ.data.length > 0 ? (
          <div className="space-y-2">
            {docsQ.data.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-md border border-neutral-100 bg-neutral-50 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText size={13} className="text-neutral-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{doc.filename}</div>
                    <div className="text-xs text-neutral-500">
                      {doc.docType} · {(doc.sizeBytes / 1024).toFixed(0)} KB
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-neutral-400 hover:text-rose-600"
                  disabled={deleteDocMut.isPending}
                  onClick={() => deleteDocMut.mutate(doc.id)}
                >
                  <Trash2 size={12} />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-neutral-400 py-4 text-center border border-dashed border-neutral-200 rounded-lg">
            No documents uploaded yet
          </div>
        )}
      </motion.div>
    </div>
  );
}

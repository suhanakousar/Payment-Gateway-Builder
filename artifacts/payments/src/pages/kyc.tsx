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
  pan: z.string().min(5, "PAN looks too short").max(20, "PAN looks too long").regex(/^[A-Z0-9]+$/i, "Use letters and digits only"),
  bankAccount: z.string().min(6, "Account number too short").max(20, "Account number too long").regex(/^\d+$/, "Digits only"),
  bankAccountHolderName: z.string().min(2, "Holder name required").max(120, "Holder name too long"),
  ifsc: z.string().min(6, "IFSC too short").max(15, "IFSC too long").regex(/^[A-Z0-9]+$/i, "Use letters and digits only"),
});

const providerSchema = z.object({
  preferredProvider: z.string().min(2, "Provider required").max(40),
  providerMerchantId: z.string().max(120).optional().or(z.literal("")),
  providerStoreId: z.string().max(120).optional().or(z.literal("")),
  providerTerminalId: z.string().max(120).optional().or(z.literal("")),
  providerReference: z.string().max(120).optional().or(z.literal("")),
  providerVpa: z.string().max(120).optional().or(z.literal("")),
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

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { pan: "", bankAccount: "", bankAccountHolderName: "", ifsc: "" },
  });
  const providerForm = useForm<ProviderValues>({
    resolver: zodResolver(providerSchema),
    defaultValues: {
      preferredProvider: merchant?.preferredProvider ?? "decentro",
      providerMerchantId: merchant?.providerMerchantId ?? "",
      providerStoreId: merchant?.providerStoreId ?? "",
      providerTerminalId: merchant?.providerTerminalId ?? "",
      providerReference: merchant?.providerReference ?? "",
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
          providerMerchantId: merchant.providerMerchantId ?? "",
          providerStoreId: merchant.providerStoreId ?? "",
          providerTerminalId: merchant.providerTerminalId ?? "",
          providerReference: merchant.providerReference ?? "",
          providerVpa: merchant.providerVpa ?? "",
        });
      }
    }
  }, [merchant, providerForm]);

  const docsQ = useQuery({
    queryKey: ["kyc", "docs"],
    queryFn: () => api<KycDoc[]>("/merchant/kyc/docs"),
    refetchInterval: (q) => {
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
          ...values,
          providerMerchantId: values.providerMerchantId || undefined,
          providerStoreId: values.providerStoreId || undefined,
          providerTerminalId: values.providerTerminalId || undefined,
          providerReference: values.providerReference || undefined,
          providerVpa: values.providerVpa || undefined,
        },
      }),
    onSuccess: async () => {
      toast.success("Provider mapping saved");
      await refresh();
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Provider settings failed"),
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
    }
  }

  if (!merchant) return null;

  const isComplete = merchant.kycStatus === "APPROVED" || merchant.kycStatus === "VERIFIED";
  const hasDetails = Boolean(previousMasked?.pan || previousMasked?.bankAccount || previousMasked?.ifsc);

  return (
    <div className="space-y-6">
      <motion.div className="border border-neutral-200 bg-white rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Lock size={14} className="text-neutral-500" />
          <h2 className="text-sm font-medium">KYC & bank</h2>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          We need this to settle payouts and stay compliant with RBI rules.
        </p>
        {isComplete && merchant.providerStatus !== "ACTIVE" && (
          <div className="border rounded-xl p-5 flex items-start gap-3 border-amber-200 bg-amber-50 text-amber-900">
            <Clock size={18} className="shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-medium">Payment provider activation in progress</div>
              <div className="text-xs mt-0.5 opacity-80">
                Your payment provider account is being activated{merchant.providerStatus ? ` (status: ${merchant.providerStatus})` : ""}. You can't create live orders until this completes — usually a few minutes.
              </div>
            </div>
          </div>
        )}
      </motion.div>

      <motion.div className="border border-neutral-200 bg-white rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={14} className="text-neutral-500" />
          <h2 className="text-sm font-medium">Provider mapping & receiving UPI</h2>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          This section decides which merchant account a generated QR belongs to. Each merchant should save their own receiving UPI ID and provider mapping here.
        </p>

        <Form {...providerForm}>
          <form onSubmit={providerForm.handleSubmit((v) => providerMut.mutate(v))} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={providerForm.control}
                name="preferredProvider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provider</FormLabel>
                    <FormControl>
                      <Input placeholder="decentro" {...field} />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Example: `decentro`, `cashfree`, `razorpay`, `pinelabs`
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={providerForm.control}
                name="providerMerchantId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provider merchant ID</FormLabel>
                    <FormControl>
                      <Input className="font-mono" placeholder="sub_merchant_123" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={providerForm.control}
                name="providerStoreId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Store ID</FormLabel>
                    <FormControl>
                      <Input className="font-mono" placeholder="store_001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={providerForm.control}
                name="providerTerminalId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Terminal ID</FormLabel>
                    <FormControl>
                      <Input className="font-mono" placeholder="terminal_001" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField
                control={providerForm.control}
                name="providerReference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference / return URL</FormLabel>
                    <FormControl>
                      <Input placeholder="Optional provider reference" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={providerForm.control}
                name="providerVpa"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Merchant receiving UPI ID</FormLabel>
                    <FormControl>
                      <Input className="font-mono" placeholder="merchant@bank" {...field} />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Every QR generated for this merchant uses this UPI identity as the receiver.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" disabled={providerMut.isPending}>
              {providerMut.isPending ? "Saving…" : "Save provider mapping"}
            </Button>
          </form>
        </Form>
      </motion.div>

      <motion.div className="border border-neutral-200 bg-white rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <Upload size={14} className="text-neutral-500" />
          <h2 className="text-sm font-medium">Step 2 — Upload supporting documents</h2>
        </div>
        <div className="text-xs text-neutral-500 mb-4">Upload PAN, cheque and other supporting KYC documents.</div>
      </motion.div>
    </div>
  );
}

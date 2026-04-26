import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ShieldCheck, Lock } from "lucide-react";
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

export default function Kyc() {
  const { merchant, refresh } = useAuth();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { pan: "", bankAccount: "", ifsc: "" },
  });
  const [previousMasked, setPreviousMasked] = useState<{
    pan: string | null;
    bankAccount: string | null;
    ifsc: string | null;
  } | null>(null);

  useEffect(() => {
    if (merchant) {
      setPreviousMasked({
        pan: merchant.pan,
        bankAccount: merchant.bankAccount,
        ifsc: merchant.ifsc,
      });
    }
  }, [merchant]);

  const mutation = useMutation({
    mutationFn: (values: Values) =>
      api<{ merchant: any }>("/merchant/kyc", { method: "PUT", body: values }),
    onSuccess: async () => {
      toast.success("KYC details saved");
      await refresh();
      form.reset({ pan: "", bankAccount: "", ifsc: "" });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Save failed"),
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">KYC & bank</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Add the details we'll use for settlements. Stored encrypted at rest.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="border border-neutral-200 bg-white rounded-xl p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-medium">Current details</h2>
            <p className="text-xs text-neutral-500">Sensitive fields are masked.</p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded border ${
            merchant?.kycStatus === "VERIFIED"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}>
            {merchant?.kycStatus ?? "PENDING"}
          </span>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
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
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="border border-neutral-200 bg-white rounded-xl p-5"
      >
        <div className="flex items-center gap-2 mb-4">
          <Lock size={14} className="text-neutral-500" />
          <h2 className="text-sm font-medium">Update details</h2>
        </div>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="pan"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>PAN</FormLabel>
                  <FormControl>
                    <Input className="font-mono uppercase" placeholder="ABCDE1234F" {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Encrypted with AES-256-GCM at rest. Only the last 4 chars are ever shown again.
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
                      <Input className="font-mono" placeholder="1234567890" {...field} />
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
                      <Input className="font-mono uppercase" placeholder="HDFC0001234" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" disabled={mutation.isPending}>
              <ShieldCheck size={14} className="mr-1.5" />
              {mutation.isPending ? "Saving…" : "Save & verify"}
            </Button>
          </form>
        </Form>
      </motion.div>
    </div>
  );
}

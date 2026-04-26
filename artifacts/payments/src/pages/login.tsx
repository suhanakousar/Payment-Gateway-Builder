import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const schema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password required"),
});

type Values = z.infer<typeof schema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { setMerchant } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: Values) {
    setSubmitting(true);
    try {
      const res = await api<{ merchant: any; ok: boolean }>("/auth/login", {
        method: "POST",
        body: values,
      });
      setMerchant(res.merchant);
      toast.success("Welcome back");
      setLocation("/dashboard");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Sign-in failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="border-b border-neutral-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/">
            <span className="font-semibold tracking-tight cursor-pointer">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 mr-2 align-middle" />
              PayLite
            </span>
          </Link>
          <Link href="/signup">
            <Button variant="ghost" size="sm">Create account</Button>
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="w-full max-w-sm"
        >
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
            <p className="text-sm text-neutral-500 mt-1">
              Welcome back to your dashboard.
            </p>
          </div>

          <div className="border border-neutral-200 rounded-xl p-6 bg-white">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="you@business.in" autoComplete="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="current-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            </Form>
          </div>

          <div className="text-xs text-neutral-500 text-center mt-6">
            Don't have an account?{" "}
            <Link href="/signup">
              <span className="text-neutral-900 underline-offset-2 hover:underline cursor-pointer">
                Sign up
              </span>
            </Link>
          </div>

          <div className="mt-4 text-[11px] text-neutral-400 text-center font-mono">
            demo@paylite.in / demo1234
          </div>
        </motion.div>
      </div>
    </div>
  );
}

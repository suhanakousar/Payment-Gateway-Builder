import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Receipt,
  FileCheck2,
  LogOut,
  Webhook,
  Menu,
  X,
  Banknote,
  AlertOctagon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { toast } from "sonner";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: Receipt },
  { href: "/settlements", label: "Settlements", icon: Banknote },
  { href: "/disputes", label: "Disputes", icon: AlertOctagon },
  { href: "/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/kyc", label: "KYC & Bank", icon: FileCheck2 },
];

export default function Layout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { merchant, setMerchant } = useAuth();

  async function handleLogout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // ignore — clear client state regardless
    }
    setMerchant(null);
    toast.success("Signed out");
    setLocation("/");
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-neutral-50">
      <div className="md:hidden flex items-center justify-between bg-white border-b border-neutral-200 px-4 py-3">
        <Link href="/dashboard">
          <span className="font-semibold tracking-tight text-lg cursor-pointer">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 mr-2 align-middle" />
            PayLite
          </span>
        </Link>
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="text-neutral-500 hover:text-neutral-900"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 bg-black/30 z-40 md:hidden"
            onClick={() => setMobileOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-neutral-200 flex flex-col
          transform transition-transform duration-200 ease-out md:relative md:translate-x-0
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="p-6 hidden md:flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <span className="font-semibold text-xl tracking-tight">PayLite</span>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-0.5">
          {NAV.map((item) => {
            const active = location === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
              >
                <div
                  className={`relative flex items-center gap-3 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors
                    ${
                      active
                        ? "text-neutral-900 bg-neutral-100"
                        : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50"
                    }`}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-indicator"
                      className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-neutral-900 rounded-r"
                      transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    />
                  )}
                  <Icon
                    size={16}
                    className={active ? "text-neutral-900" : "text-neutral-400"}
                  />
                  <span className="font-medium">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-neutral-200">
          <div className="mb-3 px-1">
            <p className="text-sm font-medium truncate">
              {merchant?.businessName ?? "Merchant"}
            </p>
            <p className="text-xs text-neutral-500 truncate">
              {merchant?.email ?? ""}
            </p>
          </div>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={handleLogout}
          >
            <LogOut size={14} className="mr-2" />
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <motion.div
            key={location}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}

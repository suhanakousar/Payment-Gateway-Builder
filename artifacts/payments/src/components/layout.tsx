import React from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  Receipt, 
  FileCheck2, 
  LogOut,
  Menu,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  
  const merchantStr = localStorage.getItem("paylite_merchant");
  const merchant = merchantStr ? JSON.parse(merchantStr) : null;

  const handleLogout = () => {
    localStorage.removeItem("paylite_token");
    localStorage.removeItem("paylite_merchant");
    setLocation("/");
  };

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/orders", label: "Orders", icon: Receipt },
    { href: "/kyc", label: "KYC & Bank", icon: FileCheck2 },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between bg-white border-b border-gray-200 px-4 py-3">
        <div className="font-semibold text-lg text-primary tracking-tight">PayLite</div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="text-gray-500 hover:text-gray-900"
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out flex flex-col
        ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
        md:relative md:translate-x-0
      `}>
        <div className="p-6 hidden md:block">
          <div className="font-bold text-2xl text-primary tracking-tight">PayLite</div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} onClick={() => setIsMobileMenuOpen(false)}>
                <div className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer
                  ${isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }
                `}>
                  <Icon size={18} className={isActive ? "text-primary" : "text-gray-400"} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-200">
          <div className="mb-4 px-2">
            <p className="text-sm font-medium text-gray-900 truncate">
              {merchant?.businessName || "Merchant"}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {merchant?.email || ""}
            </p>
          </div>
          <Button 
            variant="outline" 
            className="w-full justify-start text-gray-600" 
            onClick={handleLogout}
          >
            <LogOut size={16} className="mr-2" />
            Sign out
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
      
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-gray-900/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </div>
  );
}

import React from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, Shield, Zap } from "lucide-react";

export default function Landing() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="font-bold text-2xl text-primary tracking-tight">PayLite</div>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" className="font-medium">Log in</Button>
            </Link>
            <Link href="/signup">
              <Button className="font-medium">Sign up</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="max-w-3xl">
            <h1 className="text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 mb-6">
              Payments infrastructure for modern Indian businesses
            </h1>
            <p className="text-xl text-gray-600 mb-10 leading-relaxed max-w-2xl">
              Accept UPI payments instantly. Zero setup fees, real-time analytics, 
              and a developer-friendly platform built for scale.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button size="lg" className="h-12 px-8 text-base" onClick={() => setLocation("/signup")}>
                Start accepting payments
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button size="lg" variant="outline" className="h-12 px-8 text-base" onClick={() => setLocation("/login")}>
                Sign in to dashboard
              </Button>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 py-20 border-y border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-3 gap-12">
              <div>
                <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Instant Setup</h3>
                <p className="text-gray-600 leading-relaxed">
                  Go live in minutes with our streamlined onboarding. Just provide your bank details and start generating UPI QR codes.
                </p>
              </div>
              <div>
                <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
                  <CheckCircle2 className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Real-time Analytics</h3>
                <p className="text-gray-600 leading-relaxed">
                  Track your daily revenue, monitor success rates, and keep a pulse on your business health from a single dashboard.
                </p>
              </div>
              <div>
                <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center mb-6">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">Secure & Reliable</h3>
                <p className="text-gray-600 leading-relaxed">
                  Built on rock-solid infrastructure to ensure high availability and secure processing of all your transactions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-white py-8 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-gray-500 text-sm">
          © {new Date().getFullYear()} PayLite Inc. A test project.
        </div>
      </footer>
    </div>
  );
}

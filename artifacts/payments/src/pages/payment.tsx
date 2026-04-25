import React, { useEffect, useState } from "react";
import { useParams } from "wouter";
import { formatDistanceToNow, isPast } from "date-fns";
import { 
  useGetOrder, 
  getGetOrderQueryKey,
  useSimulatePayment
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Clock, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function PaymentPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const simulatePayment = useSimulatePayment();
  const [timeLeft, setTimeLeft] = useState<string>("");

  const { data: order, isLoading, error } = useGetOrder(orderId, {
    query: { 
      queryKey: getGetOrderQueryKey(orderId),
      refetchInterval: (query) => {
        // Poll every 3 seconds if status is PENDING
        if (query.state.data?.status === "PENDING") {
          return 3000;
        }
        return false;
      },
      enabled: !!orderId
    }
  });

  useEffect(() => {
    if (!order || order.status !== "PENDING") return;

    const expiresAt = new Date(order.expiresAt);
    
    const interval = setInterval(() => {
      if (isPast(expiresAt)) {
        setTimeLeft("Expired");
        // Refetch to get the actual expired state from server
        queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
        clearInterval(interval);
      } else {
        const msLeft = expiresAt.getTime() - Date.now();
        const minutes = Math.floor(msLeft / 60000);
        const seconds = Math.floor((msLeft % 60000) / 1000);
        setTimeLeft(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [order, orderId, queryClient]);

  const handleSimulate = async (outcome: "SUCCESS" | "FAILED") => {
    try {
      await simulatePayment.mutateAsync({
        orderId,
        data: { outcome }
      });
      queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Simulation failed",
        description: err.message || "Could not simulate payment"
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-gray-500">Loading payment details...</div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-sm border-gray-200">
          <CardContent className="pt-6 text-center space-y-4">
            <XCircle className="mx-auto h-12 w-12 text-red-500" />
            <h2 className="text-xl font-semibold text-gray-900">Order Not Found</h2>
            <p className="text-gray-500">The payment link is invalid or has expired.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 py-12">
      <div className="w-full max-w-md space-y-6">
        
        {/* Merchant Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">{order.businessName}</h1>
          <p className="text-sm text-gray-500 font-mono">Order ID: {order.orderId}</p>
        </div>

        <Card className="shadow-sm border-gray-200 overflow-hidden">
          <div className="bg-gray-50/80 p-6 text-center border-b border-gray-100">
            <p className="text-sm font-medium text-gray-500 mb-1">Amount to Pay</p>
            <p className="text-4xl font-bold text-gray-900 tracking-tight">
              {formatCurrency(order.amount)}
            </p>
            {order.note && (
              <p className="text-sm text-gray-600 mt-2 bg-white inline-block px-3 py-1 rounded-md border border-gray-100">
                "{order.note}"
              </p>
            )}
          </div>
          
          <CardContent className="p-6">
            {order.status === "PENDING" && (
              <div className="space-y-6 flex flex-col items-center text-center">
                <div className="p-3 bg-white rounded-xl shadow-sm border border-gray-100 inline-block">
                  <img 
                    src={order.qrImage} 
                    alt="UPI QR Code" 
                    className="w-48 h-48 object-contain"
                  />
                </div>
                <div className="space-y-2">
                  <p className="font-medium text-gray-900">Scan with any UPI app</p>
                  <div className="flex items-center justify-center gap-2 text-sm text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-100">
                    <Clock size={14} />
                    <span>Expires in {timeLeft || "..."}</span>
                  </div>
                </div>
              </div>
            )}

            {order.status === "SUCCESS" && (
              <div className="py-8 space-y-4 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-2">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Payment Successful</h2>
                  <p className="text-gray-500 mt-1">Your payment has been securely processed.</p>
                </div>
              </div>
            )}

            {order.status === "FAILED" && (
              <div className="py-8 space-y-4 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-2">
                  <XCircle className="h-8 w-8 text-red-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Payment Failed</h2>
                  <p className="text-gray-500 mt-1">We couldn't process your payment. Please try again.</p>
                </div>
              </div>
            )}

            {order.status === "EXPIRED" && (
              <div className="py-8 space-y-4 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-2">
                  <Clock className="h-8 w-8 text-gray-500" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Link Expired</h2>
                  <p className="text-gray-500 mt-1">This payment request is no longer valid.</p>
                </div>
              </div>
            )}
          </CardContent>

          <div className="bg-gray-50 p-4 flex justify-center border-t border-gray-100">
            <span className="text-xs font-medium text-gray-400 flex items-center gap-1">
              <ShieldCheck size={12} />
              Secured by PayLite
            </span>
          </div>
        </Card>

        {/* Development Simulator Panel */}
        {order.status === "PENDING" && (
          <div className="mt-8 border border-dashed border-gray-300 rounded-lg p-4 bg-gray-50/50">
            <div className="flex items-center justify-between mb-3">
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Dev Tool</Badge>
              <span className="text-xs font-mono text-gray-500">Test Environment</span>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Simulate a UPI webhook response since there is no real bank integration in this sandbox.
            </p>
            <div className="flex gap-3">
              <Button 
                variant="default" 
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => handleSimulate("SUCCESS")}
                disabled={simulatePayment.isPending}
              >
                Mark as Paid
              </Button>
              <Button 
                variant="outline" 
                className="flex-1 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                onClick={() => handleSimulate("FAILED")}
                disabled={simulatePayment.isPending}
              >
                Mark as Failed
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState } from "react";
import { format } from "date-fns";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer 
} from "recharts";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  useDashboardSummary, 
  getDashboardSummaryQueryKey,
  useDashboardTimeseries,
  getDashboardTimeseriesQueryKey,
  useListOrders,
  getListOrdersQueryKey,
  useCreateOrder
} from "@workspace/api-client-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, CreditCard, Activity, TrendingUp, CheckCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const createOrderSchema = z.object({
  orderId: z.string().min(1, "Reference ID is required"),
  amount: z.coerce.number().min(1, "Amount must be at least ₹1"),
  customerName: z.string().optional(),
  customerEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  note: z.string().optional(),
});

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "SUCCESS":
      return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">Success</Badge>;
    case "PENDING":
      return <Badge className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50">Pending</Badge>;
    case "FAILED":
      return <Badge className="bg-red-50 text-red-700 border-red-200 hover:bg-red-50">Failed</Badge>;
    case "EXPIRED":
      return <Badge className="bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-100">Expired</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function Dashboard() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createOrder = useCreateOrder();

  const { data: summary, isLoading: isLoadingSummary } = useDashboardSummary({
    query: { queryKey: getDashboardSummaryQueryKey() }
  });

  const { data: timeseries, isLoading: isLoadingTimeseries } = useDashboardTimeseries({ days: 30 }, {
    query: { queryKey: getDashboardTimeseriesQueryKey({ days: 30 }) }
  });

  const { data: orders, isLoading: isLoadingOrders } = useListOrders({ limit: 5 }, {
    query: { queryKey: getListOrdersQueryKey({ limit: 5 }) }
  });

  const form = useForm<z.infer<typeof createOrderSchema>>({
    resolver: zodResolver(createOrderSchema),
    defaultValues: {
      orderId: `REF-${Math.floor(Math.random() * 10000)}`,
      amount: 100,
      customerName: "",
      customerEmail: "",
      note: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof createOrderSchema>) => {
    try {
      const response = await createOrder.mutateAsync({
        data: {
          ...values,
          customerEmail: values.customerEmail || undefined,
        }
      });
      
      toast({
        title: "Order created successfully",
        description: "Opening payment page...",
      });
      
      setCreateDialogOpen(false);
      form.reset();
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey({ limit: 5 }) });
      queryClient.invalidateQueries({ queryKey: getDashboardSummaryQueryKey() });
      
      // Open payment page in new tab
      window.open(`/payment/${response.order.orderId}`, "_blank");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to create order",
        description: error.message || "An error occurred",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">Overview of your payment activity</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shrink-0 gap-2">
              <Plus size={16} />
              Create Order
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Create Payment Order</DialogTitle>
              <DialogDescription>
                Generate a new UPI QR code for a customer to scan and pay.
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <FormField
                  control={form.control}
                  name="orderId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reference ID</FormLabel>
                      <FormControl>
                        <Input {...field} />
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
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="customerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer Name (Optional)</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="customerEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email (Optional)</FormLabel>
                        <FormControl>
                          <Input type="email" {...field} />
                        </FormControl>
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
                      <FormLabel>Internal Note (Optional)</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createOrder.isPending}>
                    {createOrder.isPending ? "Creating..." : "Create Order"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-gray-500">Total Revenue</p>
              <TrendingUp className="h-4 w-4 text-gray-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold tracking-tight text-gray-900">
                {isLoadingSummary ? "..." : formatCurrency(summary?.totalRevenue || 0)}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-gray-500">Today's Revenue</p>
              <Activity className="h-4 w-4 text-gray-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold tracking-tight text-gray-900">
                {isLoadingSummary ? "..." : formatCurrency(summary?.todayRevenue || 0)}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-gray-500">Success Rate</p>
              <CheckCircle className="h-4 w-4 text-gray-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold tracking-tight text-gray-900">
                {isLoadingSummary ? "..." : `${Math.round(summary?.successRate || 0)}%`}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center justify-between space-y-0 pb-2">
              <p className="text-sm font-medium text-gray-500">Total Orders</p>
              <CreditCard className="h-4 w-4 text-gray-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold tracking-tight text-gray-900">
                {isLoadingSummary ? "..." : summary?.totalOrders || 0}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        {/* Chart */}
        <Card className="md:col-span-4 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-medium">Revenue Over Time (30 Days)</CardTitle>
          </CardHeader>
          <CardContent className="pl-0 pb-4 h-[300px]">
            {isLoadingTimeseries ? (
              <div className="h-full w-full flex items-center justify-center text-gray-400">Loading chart...</div>
            ) : timeseries && timeseries.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeseries} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#6B7280' }}
                    tickFormatter={(val) => format(new Date(val), "MMM d")}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#6B7280' }}
                    tickFormatter={(val) => `₹${val}`}
                  />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}
                    formatter={(value: number) => [`₹${value}`, 'Revenue']}
                    labelFormatter={(label) => format(new Date(label), "MMM d, yyyy")}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="revenue" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex items-center justify-center text-gray-400 text-sm">
                No data available for this period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <Card className="md:col-span-3 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingOrders ? (
              <div className="py-8 text-center text-sm text-gray-500">Loading orders...</div>
            ) : orders && orders.length > 0 ? (
              <div className="space-y-4">
                {orders.map((order) => (
                  <div 
                    key={order.id} 
                    className="flex items-center justify-between group cursor-pointer rounded-lg hover:bg-gray-50 -mx-2 px-2 py-1 transition-colors"
                    onClick={() => window.open(`/payment/${order.orderId}`, "_blank")}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${order.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                        {order.status === 'SUCCESS' ? <CheckCircle size={16} /> : <Clock size={16} />}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{order.orderId}</p>
                        <p className="text-xs text-gray-500">{format(new Date(order.createdAt), "MMM d, h:mm a")}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">{formatCurrency(order.amount)}</p>
                      <StatusBadge status={order.status} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-gray-500">
                No orders yet. Create one to get started.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

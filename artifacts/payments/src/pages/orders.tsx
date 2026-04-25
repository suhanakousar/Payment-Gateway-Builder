import React, { useState } from "react";
import { format } from "date-fns";
import { 
  useListOrders, 
  getListOrdersQueryKey 
} from "@workspace/api-client-react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";

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

export default function Orders() {
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  const { data: orders, isLoading } = useListOrders({ limit: 100 }, {
    query: { queryKey: getListOrdersQueryKey({ limit: 100 }) }
  });

  const filteredOrders = orders?.filter(order => {
    const matchesStatus = statusFilter === "ALL" || order.status === statusFilter;
    const matchesSearch = search === "" || 
      order.orderId.toLowerCase().includes(search.toLowerCase()) ||
      (order.customerName && order.customerName.toLowerCase().includes(search.toLowerCase())) ||
      (order.txnId && order.txnId.toLowerCase().includes(search.toLowerCase()));
      
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Orders</h1>
        <p className="text-sm text-gray-500">View and manage all your payment orders</p>
      </div>

      <Card className="shadow-sm">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input 
              placeholder="Search by ID, name, or txn ID..." 
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="SUCCESS">Success</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="EXPIRED">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="relative w-full overflow-auto">
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow>
                <TableHead className="w-[180px]">Order ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Txn ID</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-gray-500">
                    Loading orders...
                  </TableCell>
                </TableRow>
              ) : filteredOrders?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-gray-500">
                    No orders found matching your criteria.
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders?.map((order) => (
                  <TableRow 
                    key={order.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => window.open(`/payment/${order.orderId}`, "_blank")}
                  >
                    <TableCell className="font-medium">{order.orderId}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">{order.customerName || "—"}</span>
                        {order.customerEmail && <span className="text-xs text-gray-500">{order.customerEmail}</span>}
                      </div>
                    </TableCell>
                    <TableCell>{formatCurrency(order.amount)}</TableCell>
                    <TableCell>
                      <StatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="text-gray-500 font-mono text-xs">
                      {order.txnId || "—"}
                    </TableCell>
                    <TableCell className="text-right text-gray-500">
                      {format(new Date(order.createdAt), "MMM d, yyyy h:mm a")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

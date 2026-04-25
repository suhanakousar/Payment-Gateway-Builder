import React, { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { 
  useGetMe, 
  getGetMeQueryKey,
  useUpdateKyc
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldCheck, Info, Clock, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const kycSchema = z.object({
  pan: z.string().min(10, "PAN must be 10 characters").max(10, "PAN must be 10 characters").toUpperCase(),
  bankAccount: z.string().min(6, "Bank account number must be at least 6 digits"),
  ifsc: z.string().min(11, "IFSC must be 11 characters").max(11, "IFSC must be 11 characters").toUpperCase(),
});

type KycFormValues = z.infer<typeof kycSchema>;

export default function Kyc() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateKyc = useUpdateKyc();

  const { data: merchant, isLoading } = useGetMe({
    query: { queryKey: getGetMeQueryKey() }
  });

  const form = useForm<KycFormValues>({
    resolver: zodResolver(kycSchema),
    defaultValues: {
      pan: "",
      bankAccount: "",
      ifsc: "",
    },
  });

  const initializedRef = useRef(false);

  useEffect(() => {
    if (merchant && !initializedRef.current) {
      form.reset({
        pan: merchant.pan || "",
        bankAccount: merchant.bankAccount || "",
        ifsc: merchant.ifsc || "",
      });
      initializedRef.current = true;
    }
  }, [merchant, form]);

  const onSubmit = async (values: KycFormValues) => {
    try {
      await updateKyc.mutateAsync({ data: values });
      
      toast({
        title: "KYC Details Submitted",
        description: "Your details are pending verification.",
      });
      
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error.message || "Failed to update KYC details",
      });
    }
  };

  const isReadOnly = merchant?.kycStatus === "VERIFIED" || merchant?.kycStatus === "SUBMITTED";

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">KYC & Bank Details</h1>
        <p className="text-sm text-gray-500">Manage your business compliance and payout information</p>
      </div>

      {!isLoading && merchant && (
        <>
          {merchant.kycStatus === "VERIFIED" && (
            <Alert className="bg-emerald-50 border-emerald-200">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <AlertTitle className="text-emerald-800">KYC Verified</AlertTitle>
              <AlertDescription className="text-emerald-700">
                Your account is fully verified. You can process transactions without limits and receive settlements.
              </AlertDescription>
            </Alert>
          )}
          
          {merchant.kycStatus === "SUBMITTED" && (
            <Alert className="bg-amber-50 border-amber-200">
              <Clock className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800">Verification Pending</AlertTitle>
              <AlertDescription className="text-amber-700">
                Your details are currently being reviewed. This usually takes 1-2 business days.
              </AlertDescription>
            </Alert>
          )}

          {merchant.kycStatus === "PENDING" && (
            <Alert className="bg-blue-50 border-blue-200">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertTitle className="text-blue-800">Action Required</AlertTitle>
              <AlertDescription className="text-blue-700">
                Please submit your KYC and bank details to start receiving settlements to your bank account.
              </AlertDescription>
            </Alert>
          )}
        </>
      )}

      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Business Information</CardTitle>
              <CardDescription>Legal compliance and settlement details</CardDescription>
            </div>
            {merchant && (
              <Badge variant="outline" className={
                merchant.kycStatus === "VERIFIED" ? "bg-emerald-50 text-emerald-700" :
                merchant.kycStatus === "SUBMITTED" ? "bg-amber-50 text-amber-700" : ""
              }>
                Status: {merchant.kycStatus}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-gray-500">Loading details...</div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-gray-900 border-b pb-2">Tax Information</h3>
                  <FormField
                    control={form.control}
                    name="pan"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Permanent Account Number (PAN)</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="ABCDE1234F" 
                            {...field} 
                            disabled={isReadOnly}
                            className="uppercase"
                          />
                        </FormControl>
                        <FormDescription>10-character alphanumeric ID issued by Income Tax Department</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-gray-900 border-b pb-2">Bank Account</h3>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="bankAccount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Account Number</FormLabel>
                          <FormControl>
                            <Input 
                              type="text" 
                              placeholder="000000000000" 
                              {...field} 
                              disabled={isReadOnly}
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
                          <FormLabel>IFSC Code</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="SBIN0001234" 
                              {...field} 
                              disabled={isReadOnly}
                              className="uppercase"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {!isReadOnly && (
                  <div className="pt-4 flex justify-end">
                    <Button type="submit" disabled={updateKyc.isPending}>
                      {updateKyc.isPending ? "Submitting..." : "Submit Details"}
                    </Button>
                  </div>
                )}
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

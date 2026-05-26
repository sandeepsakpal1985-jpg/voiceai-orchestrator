"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, CreditCard, DollarSign, FileText } from "lucide-react";
import Navbar from "@/components/dashboard/navbar";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";

interface Invoice {
  id: string;
  description?: string;
  createdAt: string;
  amount?: number;
  status: string;
}

interface SubscriptionResponse {
  subscription?: {
    plan?: {
      name: string;
      price: number;
      interval: string;
      apiCalls?: number;
      callMinutes?: number;
    };
    currentPeriodEnd?: string;
    status?: string;
  };
}

export default function BillingPage() {
  const { data: invoicesData, loading } = useApi<{ invoices: Invoice[] }>("/api/billing/invoices");
  const { data: subData } = useApi<SubscriptionResponse>("/api/subscriptions");

  const invoices = invoicesData?.invoices ?? [];
  const subscription = subData?.subscription;
  const planName = subscription?.plan?.name ?? "Professional";
  const planPrice = subscription?.plan?.price ?? 99;
  const planInterval = subscription?.plan?.interval ?? "month";

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Navbar />
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DollarSign className="h-6 w-6 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Billing</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Manage your billing details and invoices</p>
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-zinc-500">Current Plan</p>
                <div className="flex items-center gap-2 mt-1">
                  <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{planName}</h2>
                  <Badge variant="success">Active</Badge>
                </div>
                <p className="text-sm text-zinc-500 mt-1">${planPrice}/{planInterval} · {subscription?.currentPeriodEnd ? `Renews on ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}` : ""}</p>
              </div>
              <Button variant="outline">Change Plan</Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-zinc-500">API Calls Used</p>
              <p className="text-2xl font-bold mt-1">{subscription?.plan?.apiCalls ? `${Math.floor(subscription.plan.apiCalls * 0.77).toLocaleString()} / ${subscription.plan.apiCalls.toLocaleString()}` : "- / -"}</p>
              <div className="mt-2 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                <div className="h-full w-[77%] bg-indigo-600 rounded-full" />
              </div>
              <p className="text-xs text-zinc-400 mt-1">77% of limit</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-zinc-500">Call Minutes Used</p>
              <p className="text-2xl font-bold mt-1">{subscription?.plan?.callMinutes ? `${Math.floor(subscription.plan.callMinutes * 0.64).toLocaleString()} / ${subscription.plan.callMinutes.toLocaleString()}` : "- / -"}</p>
              <div className="mt-2 h-2 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                <div className="h-full w-[64%] bg-emerald-600 rounded-full" />
              </div>
              <p className="text-xs text-zinc-400 mt-1">64% of limit</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-zinc-500">Status</p>
              <p className="text-2xl font-bold mt-1 capitalize">{subscription?.status?.toLowerCase() ?? "Active"}</p>
              <Badge variant={subscription?.status === "ACTIVE" ? "success" : "warning"} className="mt-2">
                {subscription?.status ?? "Active"}
              </Badge>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Payment Method</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 p-4 rounded-lg border border-zinc-200 dark:border-zinc-700">
              <div className="h-12 w-16 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <CreditCard className="h-6 w-6 text-zinc-500" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-zinc-900 dark:text-zinc-100">Visa ending in 4242</p>
                <p className="text-sm text-zinc-500">Expires 12/2028</p>
              </div>
              <Badge variant="success">Default</Badge>
              <Button variant="outline" size="sm">Update</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invoice History</CardTitle>
          </CardHeader>
          <CardContent>
            {invoices.length === 0 ? (
              <p className="text-center py-8 text-sm text-zinc-400">No invoices yet.</p>
            ) : (
            <div className="space-y-1">
              {invoices.map((invoice: Invoice) => (
                <div key={invoice.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-zinc-400" />
                    <div>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{invoice.description ?? `Invoice ${invoice.id}`}</p>
                      <p className="text-xs text-zinc-400">{invoice.id} · {new Date(invoice.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">${(invoice.amount ?? 0).toFixed(2)}</span>
                    <Badge variant={invoice.status === "paid" ? "success" : "warning"}>
                      {invoice.status}
                    </Badge>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

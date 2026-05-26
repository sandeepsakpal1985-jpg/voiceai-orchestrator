"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, CreditCard, Star } from "lucide-react";
import Navbar from "@/components/dashboard/navbar";
import { Skeleton } from "@/components/ui/skeleton";
import { useApi } from "@/hooks/use-api";

interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: string;
  apiCalls: number;
  callMinutes: number;
  teamSeats: number;
  popular: boolean;
  features: string[];
}

interface PlansResponse {
  plans: Plan[];
}

export default function SubscriptionsPage() {
  const { data: plansData, loading } = useApi<PlansResponse>("/api/subscriptions/plans");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [billingInterval, setBillingInterval] = useState<"month" | "year">("month");

  const plans = useMemo(() => {
    const list = plansData?.plans ?? [];
    if (list.length === 0) {
      return [
        { id: "starter", name: "Starter", description: "For small businesses getting started", price: 29, currency: "USD", interval: "month", apiCalls: 500, callMinutes: 100, teamSeats: 2, popular: false, features: ["500 API calls/month", "100 call minutes", "2 team seats", "Basic analytics", "Email support", "Prompt templates"] },
        { id: "pro", name: "Professional", description: "For growing teams and businesses", price: 99, currency: "USD", interval: "month", apiCalls: 5000, callMinutes: 1000, teamSeats: 10, popular: true, features: ["5,000 API calls/month", "1,000 call minutes", "10 team seats", "Advanced analytics", "Priority support", "Custom prompts", "CRM integration", "Sentiment analysis"] },
        { id: "enterprise", name: "Enterprise", description: "For large organizations", price: 299, currency: "USD", interval: "month", apiCalls: 50000, callMinutes: 10000, teamSeats: -1, popular: false, features: ["50,000 API calls/month", "10,000 call minutes", "Unlimited team seats", "Full analytics suite", "Dedicated support", "Custom integrations", "SSO & SAML", "SLA guarantee", "Custom voice models", "On-premise deployment"] },
      ];
    }
    return list;
  }, [plansData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <Navbar />
        <div className="p-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid lg:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-96 rounded-xl" />)}
          </div>
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
            <CreditCard className="h-6 w-6 text-indigo-600" />
            <div>
              <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Subscription Plans</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Choose the plan that fits your needs</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 mb-8">
          <span className={`text-sm ${billingInterval === "month" ? "font-medium text-zinc-900 dark:text-zinc-100" : "text-zinc-400"}`}>
            Monthly
          </span>
          <button
            onClick={() => setBillingInterval(billingInterval === "month" ? "year" : "month")}
            className={`relative h-7 w-14 rounded-full transition-colors ${billingInterval === "year" ? "bg-indigo-600" : "bg-zinc-200 dark:bg-zinc-700"}`}
          >
            <div className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${billingInterval === "year" ? "translate-x-8" : "translate-x-1"}`} />
          </button>
          <span className={`text-sm ${billingInterval === "year" ? "font-medium text-zinc-900 dark:text-zinc-100" : "text-zinc-400"}`}>
            Annual <span className="text-emerald-500 font-medium">Save 20%</span>
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {plans.map((plan: Plan) => {
            const price = billingInterval === "year" ? Math.round(plan.price * 0.8 * 12) : plan.price;
            const intervalLabel = billingInterval === "year" ? "/year" : "/month";
            return (
              <Card
                key={plan.id}
                className={`relative cursor-pointer transition-all hover:shadow-lg ${
                  selectedPlan === plan.id
                    ? "ring-2 ring-indigo-500 shadow-lg"
                    : ""
                } ${plan.popular ? "border-indigo-500" : ""}`}
                onClick={() => setSelectedPlan(plan.id)}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge variant="primary" className="px-4 py-1">
                      <Star className="h-3 w-3 mr-1" />
                      Most Popular
                    </Badge>
                  </div>
                )}
                <CardContent className="p-6 pt-8">
                  <div className="text-center mb-6">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{plan.name}</h3>
                    <p className="text-sm text-zinc-500 mt-1">{plan.description}</p>
                  </div>

                  <div className="text-center mb-6">
                    <span className="text-4xl font-bold text-zinc-900 dark:text-zinc-100">${price}</span>
                    <span className="text-sm text-zinc-400">{intervalLabel}</span>
                  </div>

                  <ul className="space-y-3 mb-6">
                    {(plan.features ?? []).map((feature, i: number) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                        <span className="text-sm text-zinc-600 dark:text-zinc-400">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className={`w-full ${plan.popular ? "" : ""}`}
                    variant={plan.popular ? "default" : "outline"}
                  >
                    {selectedPlan === plan.id ? "Current Plan" : `Choose ${plan.name}`}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Vasudeva Compliance Engine ──────────────────────────────────
// KYC tracking, regulatory disclaimers, audit log, subscription tiers

export const complianceStatus = {
  kyc: {
    status: "pending",
    pan: "XXXXXXXXXX",
    aadhaar: "Linked",
    bankVerified: true,
    kycDate: null,
    steps: [
      { name: "PAN Verification", completed: true, date: "2026-05-15" },
      { name: "Aadhaar Linking", completed: true, date: "2026-05-15" },
      { name: "Bank Account Verification", completed: true, date: "2026-05-16" },
      { name: "In-Person Verification (IPV)", completed: false, date: null },
      { name: "Risk Profiling", completed: false, date: null }
    ]
  },
  amfi: {
    arn: "ARN-123456",
    amfiRegistered: true,
    validUntil: "2027-12-31"
  },
  sebi: {
    registrationType: "Analysis & Education (No License Required)",
    disclaimerVersion: "v1.0",
    lastReviewDate: "2026-06-01",
    registrationNumber: "INAXXXXXXXX"
  },
  audit: {
    totalActions: 0,
    lastAuditDate: new Date().toISOString().split("T")[0]
  }
};

export const regulatoryDisclaimers = [
  "📋 Investments in securities are subject to market risks. Please read all scheme-related documents carefully.",
  "⚖️ The analysis provided is for educational and informational purposes only and does not constitute investment advice.",
  "🔒 Past performance is not indicative of future returns. The score engine uses historical data and simulated analysis.",
  "📝 SEBI registration is not required for providing educational analysis tools. We do not provide personalized advice.",
  "✅ All trading decisions are made by the user. Our platform provides decision support, not automated recommendations.",
  "📊 Data displayed may be delayed. Real-time data requires a licensed exchange feed.",
  "🔐 Your data is encrypted and stored securely. We do not share personal information with third parties without consent."
];

export const subscriptionTiers = [
  {
    name: "Free",
    price: 0,
    period: "/ month",
    color: "#8896a8",
    features: [
      "Watchlist (up to 5 stocks)",
      "Basic candlestick chart",
      "Limited scanner (3 setups)",
      "Basic score",
      "Risk calculator"
    ],
    limits: { watchlist: 5, scanner: 3, alerts: 0, backtests: 0, strategies: 3 }
  },
  {
    name: "Starter",
    price: 299,
    period: "/ month",
    color: "#22c55e",
    features: [
      "Full watchlist (up to 50 stocks)",
      "Full scanner (all setups)",
      "Strategy templates (all 8)",
      "Risk calculator + position sizing",
      "1 alert rule",
      "Trade journal"
    ],
    popular: false,
    limits: { watchlist: 50, scanner: 999, alerts: 1, backtests: 10, strategies: 8 }
  },
  {
    name: "Pro",
    price: 999,
    period: "/ month",
    color: "#3b82f6",
    features: [
      "Everything in Starter",
      "F&O intelligence panel",
      "Options chain visualizer",
      "Backtesting engine (unlimited)",
      "Custom strategy builder",
      "10 alert rules",
      "Broker connection + paper trading",
      "Multi-timeframe chart"
    ],
    popular: true,
    limits: { watchlist: 999, scanner: 999, alerts: 10, backtests: 999, strategies: 20 }
  },
  {
    name: "Elite",
    price: 2999,
    period: "/ month",
    color: "#8b5cf6",
    features: [
      "Everything in Pro",
      "AI Chat Assistant",
      "Multi-broker connection",
      "50 alert rules",
      "Portfolio analytics",
      "IPO access & allocation",
      "Mutual fund purchase",
      "Gold & multi-asset analysis",
      "API access for data feeds",
      "Priority support"
    ],
    limits: { watchlist: 999, scanner: 999, alerts: 50, backtests: 999, strategies: 999 }
  }
];

export const auditLogEntry = (action) => {
  return {
    id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    action,
    timestamp: new Date().toISOString(),
    user: "demo-user",
    ip: "127.0.0.1"
  };
};

export function getTierByRequirements(requirements) {
  // Return the cheapest tier that meets all requirements
  for (const tier of subscriptionTiers) {
    let meets = true;
    for (const [key, value] of Object.entries(requirements)) {
      if ((tier.limits[key] || 0) < value) { meets = false; break; }
    }
    if (meets) return tier;
  }
  return subscriptionTiers[subscriptionTiers.length - 1];
}

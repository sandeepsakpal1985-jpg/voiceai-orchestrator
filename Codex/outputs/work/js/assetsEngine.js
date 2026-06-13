// ── Vasudeva Multi-Asset Engine ─────────────────────────────────
// Gold, SGB, Fixed Deposits, REITs, Corporate Bonds, International

export const goldData = {
  spot: { price: 7148, change: 24, unit: "₹/gram", date: "2026-06-07" },
  etfs: [
    { name: "Nippon India Gold ETF", symbol: "GOLDETF", price: 631.2, change: 0.38, aum: 18500, expense: 0.25 },
    { name: "SBI Gold ETF", symbol: "SBIGOLD", price: 624.8, change: 0.32, aum: 14200, expense: 0.28 },
    { name: "ICICI Prudential Gold ETF", symbol: "ICICIGOLD", price: 628.5, change: 0.35, aum: 12800, expense: 0.30 },
    { name: "HDFC Gold ETF", symbol: "HDFCGOLD", price: 626.4, change: 0.34, aum: 11200, expense: 0.26 }
  ],
  sovereignGoldBonds: {
    series: "SGB 2026-27 Series I",
    issuePrice: 6712,
    currentPrice: 7346,
    tenor: 8,
    couponRate: 2.5,
    maturityDate: "2034-06-15",
    totalReturn: 18.2
  },
  digitalGold: {
    providers: [
      { name: "Digital Gold (MMTC-PAMP)", price: 7148, minInvestment: 100, storage: "Free" },
      { name: "Augmont Gold", price: 7142, minInvestment: 50, storage: "Free" }
    ]
  }
};

export const fixedDeposits = [
  { bank: "SBI", rate: 7.25, tenure: "1 Year", minDeposit: 10000, seniorRate: 7.75, rating: "AAA" },
  { bank: "HDFC Bank", rate: 7.40, tenure: "1 Year", minDeposit: 10000, seniorRate: 7.90, rating: "AAA" },
  { bank: "ICICI Bank", rate: 7.35, tenure: "1 Year", minDeposit: 10000, seniorRate: 7.85, rating: "AAA" },
  { bank: "Axis Bank", rate: 7.30, tenure: "1 Year", minDeposit: 5000, seniorRate: 7.80, rating: "AAA" },
  { bank: "Kotak Bank", rate: 7.20, tenure: "1 Year", minDeposit: 5000, seniorRate: 7.70, rating: "AAA" },
  { bank: "Bajaj Finance", rate: 8.05, tenure: "1 Year", minDeposit: 25000, seniorRate: 8.30, rating: "AAA" },
  { bank: "Shriram Finance", rate: 8.50, tenure: "1 Year", minDeposit: 5000, seniorRate: 8.75, rating: "AA+" },
  { bank: "Mahindra Finance", rate: 8.25, tenure: "1 Year", minDeposit: 10000, seniorRate: 8.50, rating: "AA+" }
];

export const reitsInvits = [
  { name: "Embassy Office Parks REIT", symbol: "EMBASSY", price: 346.2, change: 0.42, dividendYield: 7.2, sector: "Office", portfolioValue: 42500 },
  { name: "Mindspace Business Parks REIT", symbol: "MINDTREE", price: 336.8, change: 0.28, dividendYield: 6.8, sector: "Office", portfolioValue: 31200 },
  { name: "Brookfield India REIT", symbol: "BROOKFIELD", price: 258.4, change: -0.12, dividendYield: 7.5, sector: "Office", portfolioValue: 26800 },
  { name: "Nexus Select Trust REIT", symbol: "NEXUS", price: 138.6, change: 0.56, dividendYield: 6.4, sector: "Retail", portfolioValue: 18400 },
  { name: "PowerGrid InvIT", symbol: "PGINVIT", price: 98.4, change: 0.18, dividendYield: 8.6, sector: "Power", portfolioValue: 14200 }
];

export const corporateBonds = [
  { name: "NTPC Green Bonds 2029", rating: "AAA", coupon: 7.85, maturity: "2029-06", minInvestment: 100000, yield: 7.72 },
  { name: "HDFC Ltd NCD 2028", rating: "AAA", coupon: 8.10, maturity: "2028-12", minInvestment: 100000, yield: 7.95 },
  { name: "LIC Housing Finance Bonds", rating: "AAA", coupon: 7.95, maturity: "2027-09", minInvestment: 10000, yield: 7.82 },
  { name: "Tata Capital NCD 2028", rating: "AAA", coupon: 8.25, maturity: "2028-03", minInvestment: 10000, yield: 8.10 },
  { name: "Muthoot Finance NCD 2027", rating: "AA+", coupon: 9.10, maturity: "2027-06", minInvestment: 10000, yield: 8.85 }
];

export function compareAssetReturns() {
  return {
    gold1Y: { name: "Gold (SGB)", return: 18.2, risk: "Low-Moderate" },
    fd1Y: { name: "Top FD (1yr)", return: 8.50, risk: "Low" },
    reit1Y: { name: "REITs Avg", return: 14.6, risk: "Moderate" },
    bond1Y: { name: "Corp Bonds (AAA)", return: 8.10, risk: "Low-Moderate" },
    nifty1Y: { name: "NIFTY 50", return: 16.8, risk: "High" },
    equityMf1Y: { name: "Large Cap MF Avg", return: 15.5, risk: "Moderate-High" }
  };
}

export function calculateFDReturn({ amount, rate, years }) {
  const r = rate / 100;
  const maturity = amount * Math.pow(1 + r, years);
  const interest = maturity - amount;
  return {
    amount,
    rate,
    years,
    maturity: Math.round(maturity),
    interest: Math.round(interest),
    effectiveYield: Math.round(((Math.pow(1 + r, years) - 1) / years) * 100 * 100) / 100
  };
}

export function calculateGoldInvestment({ grams, price }) {
  const cost = grams * price;
  return {
    grams,
    pricePerGram: price,
    totalCost: cost,
    estimatedAnnualStorage: cost * 0.005,
    liquidity: "High"
  };
}

export function calculateSGBReturn({ price, series }) {
  const sgb = goldData.sovereignGoldBonds;
  const capitalGain = (sgb.currentPrice - price) / price * 100;
  const annualCoupon = sgb.couponRate;
  return {
    price,
    currentPrice: sgb.currentPrice,
    capitalGain: Math.round(capitalGain * 10) / 10,
    annualCoupon,
    totalAnnualReturn: Math.round((capitalGain + annualCoupon) * 10) / 10,
    remainingTenor: sgb.tenor,
    taxAdvantage: "Capital gains are tax-free if held to maturity"
  };
}

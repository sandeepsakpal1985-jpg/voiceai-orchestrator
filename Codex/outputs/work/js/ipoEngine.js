// ── Vasudeva IPO Engine ─────────────────────────────────────────
// IPO Calendar, application workflow, allotment tracking, GMP

export const upcomingIPOs = [
  {
    name: "Tata Technologies Ltd",
    symbol: "TATATECH",
    priceBand: { min: 498, max: 500 },
    lotSize: 30,
    openDate: "2026-07-10",
    closeDate: "2026-07-12",
    listingDate: "2026-07-22",
    gmp: 82,
    gmpPercent: 16.4,
    lotValue: 15000,
    rating: 4,
    category: "Mainboard",
    sector: "Technology",
    about: "Tata Group's engineering services arm offering design and manufacturing solutions globally.",
    subscriptions: 42.5,
    status: "upcoming"
  },
  {
    name: "Bajaj Housing Finance",
    symbol: "BAJAJHOUS",
    priceBand: { min: 66, max: 70 },
    lotSize: 210,
    openDate: "2026-07-15",
    closeDate: "2026-07-17",
    listingDate: "2026-07-28",
    gmp: 24,
    gmpPercent: 34.3,
    lotValue: 14700,
    rating: 5,
    category: "Mainboard",
    sector: "Financial Services",
    about: "Bajaj Group's housing finance subsidiary with strong parentage and rapid growth.",
    subscriptions: 68.2,
    status: "upcoming"
  },
  {
    name: "IndusMax Logistics",
    symbol: "INDUSMAX",
    priceBand: { min: 142, max: 148 },
    lotSize: 100,
    openDate: "2026-07-22",
    closeDate: "2026-07-24",
    listingDate: "2026-08-04",
    gmp: 42,
    gmpPercent: 28.4,
    lotValue: 14800,
    rating: 3,
    category: "SME",
    sector: "Logistics",
    about: "Fast-growing logistics provider with pan-India network and tech-enabled operations.",
    subscriptions: 18.6,
    status: "upcoming"
  },
  {
    name: "GreenEnergy Solutions",
    symbol: "GREENEN",
    priceBand: { min: 285, max: 298 },
    lotSize: 50,
    openDate: "2026-07-28",
    closeDate: "2026-07-30",
    listingDate: "2026-08-11",
    gmp: 56,
    gmpPercent: 18.8,
    lotValue: 14900,
    rating: 4,
    category: "Mainboard",
    sector: "Renewable Energy",
    about: "End-to-end solar energy solutions provider with utility-scale project expertise.",
    subscriptions: 35.4,
    status: "upcoming"
  },
  {
    name: "QuickMed Healthcare",
    symbol: "QUICKMED",
    priceBand: { min: 412, max: 432 },
    lotSize: 35,
    openDate: "2026-08-05",
    closeDate: "2026-08-07",
    listingDate: "2026-08-19",
    gmp: 68,
    gmpPercent: 15.7,
    lotValue: 15120,
    rating: 5,
    category: "Mainboard",
    sector: "Healthcare",
    about: "Chain of multi-specialty hospitals with strong presence in tier-2 cities.",
    subscriptions: 52.8,
    status: "upcoming"
  },
  {
    name: "Zerocost Fashion",
    symbol: "ZEROFASH",
    priceBand: { min: 185, max: 195 },
    lotSize: 75,
    openDate: "2026-06-20",
    closeDate: "2026-06-24",
    listingDate: "2026-07-05",
    gmp: 32,
    gmpPercent: 16.4,
    lotValue: 14625,
    rating: 3,
    category: "Mainboard",
    sector: "Retail",
    about: "Value fashion retail chain with 200+ stores across India.",
    subscriptions: 28.4,
    status: "open"
  },
  {
    name: "DataCore Analytics",
    symbol: "DATACORE",
    priceBand: { min: 325, max: 342 },
    lotSize: 45,
    openDate: "2026-06-18",
    closeDate: "2026-06-20",
    listingDate: "2026-06-30",
    gmp: 88,
    gmpPercent: 25.7,
    lotValue: 15390,
    rating: 4,
    category: "Mainboard",
    sector: "Technology",
    about: "AI-powered data analytics platform serving enterprise clients globally.",
    subscriptions: 75.2,
    status: "just_closed"
  },
  {
    name: "Coastal Infrastructure",
    symbol: "COASTAL",
    priceBand: { min: 108, max: 114 },
    lotSize: 130,
    openDate: "2026-06-26",
    closeDate: "2026-06-28",
    listingDate: "2026-07-08",
    gmp: 22,
    gmpPercent: 19.3,
    lotValue: 14820,
    rating: 3,
    category: "SME",
    sector: "Infrastructure",
    about: "Coastal and port infrastructure development company with government contracts.",
    subscriptions: 15.8,
    status: "open"
  }
];

export const recentListings = [
  { name: "TechVista Corp", listingGain: 32.4, listingPrice: 218.5, currentPrice: 246.8, currentGain: 47.1, status: "listed" },
  { name: "MediSync Pharma", listingGain: 18.6, listingPrice: 142.3, currentPrice: 158.6, currentGain: 32.2, status: "listed" },
  { name: "UrbanMart Retail", listingGain: -4.2, listingPrice: 168.4, currentPrice: 152.8, currentGain: -12.8, status: "listed" }
];

export function calculateIPOInvestment(ipo, lots) {
  const shares = ipo.lotSize * lots;
  const upperPrice = ipo.priceBand.max;
  const lowerPrice = ipo.priceBand.min;
  const investmentUpper = shares * upperPrice;
  const investmentLower = shares * lowerPrice;
  const estimatedListingGain = shares * ipo.gmp;

  return {
    shares,
    investmentUpper: Math.round(investmentUpper),
    investmentLower: Math.round(investmentLower),
    estimatedListingGain: Math.round(estimatedListingGain),
    estimatedReturnPct: ipo.gmpPercent,
    totalValue: Math.round(investmentUpper + estimatedListingGain)
  };
}

export function getIPOCalendar() {
  const now = new Date();
  return {
    upcoming: upcomingIPOs.filter(ipo => ipo.status === "upcoming"),
    open: upcomingIPOs.filter(ipo => ipo.status === "open"),
    justClosed: upcomingIPOs.filter(ipo => ipo.status === "just_closed")
  };
}

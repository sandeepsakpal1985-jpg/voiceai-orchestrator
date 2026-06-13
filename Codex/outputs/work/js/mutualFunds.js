// ── Vasudeva Mutual Fund Engine ─────────────────────────────────
// MF discovery, analysis, comparison, SIP calculator, and goal planning

import { mutualFunds } from "./mockData.js";

export function getAllFunds() {
  return mutualFunds;
}

export function searchFunds(query) {
  const q = query.toLowerCase();
  if (!q) return mutualFunds;
  return mutualFunds.filter(f =>
    f.name.toLowerCase().includes(q) ||
    f.amc.toLowerCase().includes(q) ||
    f.category.toLowerCase().includes(q)
  );
}

export function filterFunds({ category, risk, rating, minReturns1Y }) {
  let filtered = [...mutualFunds];
  if (category) filtered = filtered.filter(f => f.category === category);
  if (risk) filtered = filtered.filter(f => f.risk === risk);
  if (rating) filtered = filtered.filter(f => f.rating >= rating);
  if (minReturns1Y) filtered = filtered.filter(f => f.returns["1Y"] >= minReturns1Y);
  return filtered;
}

export function calculateSIP({ monthlyAmount, expectedReturn, years }) {
  const monthlyRate = expectedReturn / 100 / 12;
  const months = years * 12;
  const totalInvested = monthlyAmount * months;

  // Future value of SIP: P * ((1 + r)^n - 1) / r * (1 + r)
  const futureValue = monthlyAmount * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate);

  return {
    monthlyAmount,
    years,
    expectedReturn,
    totalInvested: Math.round(totalInvested),
    futureValue: Math.round(futureValue),
    estimatedReturns: Math.round(futureValue - totalInvested)
  };
}

export function calculateLumpsum({ amount, expectedReturn, years }) {
  const rate = expectedReturn / 100;
  const futureValue = amount * Math.pow(1 + rate, years);

  return {
    amount,
    years,
    expectedReturn,
    futureValue: Math.round(futureValue),
    estimatedReturns: Math.round(futureValue - amount)
  };
}

export function compareFunds(fundNames) {
  const matched = mutualFunds.filter(f => fundNames.includes(f.name));
  if (matched.length < 2) return null;

  return {
    funds: matched,
    comparison: matched.map(f => ({
      name: f.name,
      nav: f.nav,
      returns1Y: f.returns["1Y"],
      returns3Y: f.returns["3Y"],
      returns5Y: f.returns["5Y"],
      risk: f.risk,
      rating: f.rating
    })),
    best1Y: matched.reduce((best, f) => f.returns["1Y"] > best.returns["1Y"] ? f : best, matched[0]),
    best3Y: matched.reduce((best, f) => f.returns["3Y"] > best.returns["3Y"] ? f : best, matched[0]),
    best5Y: matched.reduce((best, f) => f.returns["5Y"] > best.returns["5Y"] ? f : best, matched[0])
  };
}

export function getCategoryReturns() {
  const categories = {};
  mutualFunds.forEach(f => {
    if (!categories[f.category]) {
      categories[f.category] = { funds: [], returns1Y: [], returns3Y: [], returns5Y: [] };
    }
    categories[f.category].funds.push(f.name);
    categories[f.category].returns1Y.push(f.returns["1Y"]);
    categories[f.category].returns3Y.push(f.returns["3Y"]);
    categories[f.category].returns5Y.push(f.returns["5Y"]);
  });

  const result = {};
  Object.entries(categories).forEach(([cat, data]) => {
    result[cat] = {
      fundCount: data.funds.length,
      avg1Y: Math.round(data.returns1Y.reduce((s, r) => s + r, 0) / data.returns1Y.length * 10) / 10,
      avg3Y: Math.round(data.returns3Y.reduce((s, r) => s + r, 0) / data.returns3Y.length * 10) / 10,
      avg5Y: Math.round(data.returns5Y.reduce((s, r) => s + r, 0) / data.returns5Y.length * 10) / 10,
      topFund: data.funds[0]
    };
  });

  return result;
}

export function getGoalCalculator({ goalAmount, years, expectedReturn, monthlyInvestment }) {
  const monthlyRate = expectedReturn / 100 / 12;
  const months = years * 12;

  // Required SIP to reach goal
  const requiredSIP = goalAmount / (((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) * (1 + monthlyRate));

  // If monthlyInvestment is provided, check if goal is achievable
  const achievable = monthlyInvestment ? monthlyInvestment >= requiredSIP : null;

  return {
    goalAmount,
    years,
    expectedReturn,
    requiredMonthlySIP: Math.round(requiredSIP),
    totalInvestment: Math.round(requiredSIP * months),
    estimatedReturns: Math.round(goalAmount - requiredSIP * months),
    achievable
  };
}

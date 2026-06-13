# Dashboard KPI Review — MetaPilot AI

> **Objective:** Business owners care about 10 specific metrics. Review dashboards against these. Remove vanity metrics. Highlight business metrics.

## The 10 KPIs Business Owners Care About

| # | KPI | Dashboard Location | Present? | Data Source |
|---|-----|-------------------|----------|-------------|
| 1 | Followers Gained | Dashboard + Growth page | ✅ | Real Meta API |
| 2 | Leads Generated | Dashboard, Growth, Insights | ✅ | Real DB |
| 3 | Conversations Handled | Dashboard (Comments + DMs) | ✅ | Real DB |
| 4 | Response Time | ❌ NOWHERE | ❌ Missing | Would need timestamps |
| 5 | Revenue Generated | Dashboard, Growth, Insights | ✅ | Real DB (from deals) |
| 6 | AI Contribution % | Dashboard, Growth, Insights | ✅ | Real calculation |
| 7 | Missed Opportunities | Dashboard + dedicated page | ✅ | Real detection |
| 8 | Reputation Score | Dashboard + Reputation page | ✅ | Real sentiment |
| 9 | Top Performing Posts | Content page | ✅ | Real engagement + mock metrics |
| 10 | Conversion Rate | Growth page, Dashboard | ✅ | Lead→Opp, Opp→Won rates |

## Findings

### 🟢 9/10 KPIs Present ✅
9 of the 10 essential business KPIs are visible somewhere in the product.

### 🔴 1 Missing: Response Time
**Not tracked anywhere.** A business owner has no way to know:
- How fast AI responds to comments
- How fast AI responds to DMs
- Average response time vs competitors
- SLA compliance (e.g., "respond within 5 minutes")

**Why it matters:** Response time is a key competitive metric. Fast AI responses = better customer experience = more conversions.

**Quick fix:** Add `replyDelay` to comments (already exists in Prisma schema!) and compute average response time in analytics.

### 🟡 Vanity Metrics Present
The following metrics are displayed but don't directly drive business decisions:

| Metric | Page | Why Vanity |
|--------|------|------------|
| `estimatedReach` | Content | Mocked value, not real |
| `estimatedLikes` | Content | Mocked value, not real |
| `estimatedShares` | Content | Mocked value, not real |
| `engagementRate` | Content | Derived from mocked values |
| Open Escalations count | Dashboard | Useful but not a KPI |

### 🟡 Metrics That Could Be Better Presented

| Current | Suggested Improvement |
|---------|----------------------|
| Revenue as raw number | Show month-over-month growth % |
| Lead count as raw number | Show lead quality breakdown (VIP/Hot/Warm/Cold %) |
| Conversations as raw number | Show conversion rate (conversation → lead %) |
| AI attribution as percentage | Show dollar value alongside percentage |

## Recommendations

### Critical (Missing KPI)
1. **Add Average Response Time** — The `replyDelay` field already exists on `SocialComment`. Compute and display average response time for comments and DMs. Add to Dashboard and Growth pages.

### Quick Wins (Better Presentation)
2. **Revenue cards** — Show MoM growth % alongside raw revenue (already partially done in Growth page with "vs last period")
3. **Lead quality** — Replace raw counts with percentage breakdown showing distribution
4. **Conversion rate** — Already displayed. Ensure it's visible on main dashboard without scrolling.

### Remove/Replace Vanity
5. **Content page** — Remove or clearly label `estimatedReach`, `estimatedLikes`, `estimatedShares` as estimated. Focus on real metrics: comments, unique commenters, leads generated, sentiment.

## Summary

| Aspect | Score | Notes |
|--------|-------|-------|
| Essential KPIs covered | 9/10 ✅ | Missing response time |
| Vanity metrics | 4 present 🟡 | Content page mock data |
| Presentation quality | Good ✅ | Clean cards, charts, trends |
| Mobile view | Good ✅ | Responsive grids |
| Drill-down capability | Good ✅ | Click-through to detail pages |

**Score: 85/100** — Strong KPI coverage. Missing response time tracking would be the highest-impact addition for a business owner.

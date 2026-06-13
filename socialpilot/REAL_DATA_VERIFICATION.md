# REAL_DATA_VERIFICATION.md — MetaPilot AI

> **Objective:** Verify every dashboard/dashboard page uses real API data from the database, not hardcoded values, fake charts, or placeholder percentages.

## Methodology

Each page's `useEffect`/data-fetching logic was inspected. All API calls point to backend endpoints that perform real Prisma queries against PostgreSQL.

## Results

| Page | Data Source | Verdict | Notes |
|------|-------------|---------|-------|
| **Dashboard** | 6 API calls: `/api/analytics/overview`, `/api/revenue/summary`, `/api/revenue/executive-summary`, `/api/missed-opportunities/stats`, `/api/reputation/overview`, `/api/meta-insights/followers` | ✅ **REAL** | Every widget pulls from real queries. No hardcoded values. |
| **Growth** | 6 API calls: `/api/analytics/leads`, `/api/analytics/growth`, `/api/revenue/summary`, `/api/revenue/trend`, `/api/revenue/funnel`, `/api/meta-insights/followers` | ✅ **REAL** | Revenue trend chart, conversion funnel, lead distribution all real. |
| **Insights** | API calls: `/api/analytics/insights`, `/api/revenue/executive-summary`, POST `/api/analytics/insights/generate` | ✅ **REAL** | Insights are AI-generated from real conversation data. |
| **Funnels** | API call: `/api/analytics/overview` | ✅ **REAL** | Funnel built from real user counts. |
| **Content** | API call: `/api/content/top-posts` | ⚠️ **PARTIAL** | Comment data, leads, engagement score are real. **Reach, likes, shares are mocked** (estimated from comment count). |
| **Reputation** | API call: `/api/reputation/overview` | ✅ **REAL** | Score from real comment sentiment, alerts from real escalations. |
| **Health** | API call: `/api/meta-health/overview`, POST `/api/meta-health/check` | ✅ **REAL** | Token expiry, webhook stats, health check all hit real Meta API. |
| **CRM** | API calls: `/api/crm`, `/api/revenue/summary`, `/api/revenue/funnel` | ✅ **REAL** | Kanban deals, pipeline value, win rate all from real data. |
| **Leads** | API call: `/api/leads` | ✅ **REAL** | All leads from database with real scores and categories. |
| **Success** | API call: `/api/customer-success/dashboard` | ✅ **REAL** | Real metrics, milestones, recommendations. |
| **Reports** | API calls: `/api/reports/config`, POST `/api/reports/generate` | ✅ **REAL** | Real metrics in generated reports. |
| **Approvals** | API calls: `/api/approvals`, `/api/approvals/stats` | ✅ **REAL** | Real approval requests from database. |
| **Missed Opps** | API calls: `/api/missed-opportunities`, POST `/api/missed-opportunities/detect` | ✅ **REAL** | Detection scans real comments/DMs/leads. |
| **Re-engagement** | API calls: `/api/n8n/status`, `/api/reengagement/rules`, `/api/reengagement/candidates` | ✅ **REAL** | Real rules from database, real dormant leads. |
| **Billing** | API calls: `/api/subscription/plans`, `/api/subscription/current`, `/api/subscription/billing-history`, `/api/subscription/usage` | ✅ **REAL** | All from database + Razorpay. |
| **Settings** | API calls: `/api/settings`, `/api/auth/me` | ✅ **REAL** | Real brand settings from database. |
| **Team** | API calls: `/api/team` | ✅ **REAL** | Real team members from database. |
| **Partner Portal** | API call: `/api/partners/portal` | ✅ **REAL** | Real partners, customers, MRR from database. |
| **Onboarding** | API call: `/api/auth/me` | ✅ **REAL** | Real onboarding state. |
| **Automation** | API calls: `/api/automation/triggers`, `/api/automation/copilot` | ✅ **REAL** | Real keyword triggers from BrandSettings. |

## Issues Found

### 🟡 Content Page — Estimated Reach/Likes/Shares Are Mocked
- **`estimatedReach`** = `totalComments * 50`
- **`estimatedLikes`** = `totalComments * 0.4`
- **`estimatedShares`** = `totalComments * 0.1`
- **`engagementRate`** = derived from above mock values

These are displayed in the Content Intelligence page as if they were real metrics. A business owner seeing "Reach: 2,500" has no way to know this is an estimate.

**Fix options:**
1. Remove these columns from the UI entirely (focus on comments, leads, and engagement score which are real)
2. Add clear label: "estimated" or "derived from engagement"
3. Implement real Meta Graph API calls for post metrics (complex — requires separate API calls per post)

### ✅ All Other Pages Verified
No fake charts, no fake statistics, no placeholder percentages found in any other page.

## Conclusion

**Score: 18/19 pages verified ✅ — 1 page with mocked metrics 🟡**

The product does not have a systemic fake-data problem. Data flows from Meta webhooks → DB → API → UI correctly. The only issue is the Content page displaying estimated reach/likes/shares as if they were real.

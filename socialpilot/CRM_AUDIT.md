# CRM Production Audit — MetaPilot AI

> **Objective:** Audit CRM against "HubSpot-lite" expectations. Identify gaps. Fix lightweight issues. Keep it simple.

## What Exists

### Routes
| Endpoint | Status | Purpose |
|----------|--------|---------|
| `GET /api/crm` | ✅ Real | List deals grouped by stage (Kanban) |
| `GET /api/crm/:id` | ✅ Real | Get single deal with lead + activities |
| `PUT /api/crm/:id/stage` | ✅ Real | Change deal stage (8 stages) |
| `POST /api/crm/:id/activities` | ✅ Real | Add activity (note/call/email/demo/meeting/follow_up) |
| `PUT /api/crm/:id` | ✅ Real | Update deal (title, value, assignedTo, notes, followUpAt) |

### Prisma Schema
```
CRMDeal: id, userId, leadId, title, value, revenue, currency, stage,
         dealStatus, assignedTo, notes, aiSummary, leadScore, sentiment,
         recommendedAction, followUpAt, createdAt, updatedAt

CRMActivity: id, dealId, type, content, createdBy, createdAt

Lead: id, userId, name, socialHandle, platform, phone, email, company,
      city, requirement, budget, category, leadScore, sentiment, source,
      ctaClicks, lastContactAt, conversationSummary, recommendedAction, tags
```

### Frontend
- Kanban board with 8 stage columns
- Deal cards showing title, value, lead info, source
- Click-to-view timeline modal
- Pipeline value, win rate, AI revenue % stats
- Activity timeline per deal

## HubSpot-Lite Audit

| Feature | Status | Notes |
|---------|--------|-------|
| **Lead Creation** | ✅ Complete | Auto-created from AI conversations + manual creation |
| **Lead Scoring** | ✅ Complete | Real AI scoring (0-100) from classifier |
| **Lead Categories** | ✅ Complete | cold / warm / hot / vip |
| **Lead Sources** | ✅ Complete | comment / dm / manual (with tags for recovered) |
| **Deal Creation** | ✅ Complete | Auto from high-score leads + manual convert |
| **Deal Stages** | ✅ Complete | 8 stages: new → contacted → qualified → demo → proposal → negotiation → won/lost |
| **Stage Transitions** | ✅ Complete | Drag or click to move stages |
| **Activity Logging** | ✅ Complete | Auto-logged on stage change + manual notes |
| **Timeline View** | ✅ Complete | Full event history in modal |
| **Deal Value** | ✅ Complete | Tracked per deal |
| **Deal Revenue** | ✅ Complete | Separate revenue field (for won deals with actual revenue) |
| **Pipeline Value** | ✅ Complete | Sum of all active deal values |
| **Win Rate** | ✅ Complete | opportunityToWon rate |
| **AI Revenue %** | ✅ Complete | Deals with AI source / total revenue |
| **Follow-up Reminders** | ✅ Complete | `followUpAt` field + re-engagement rules |
| **Deal Notes** | ✅ Complete | Free-text notes field |
| **Assignees** | ✅ Complete | `assignedTo` field |
| **Search** | ❌ Missing | No CRM-wide search endpoint |
| **Bulk Actions** | ❌ Missing | No bulk stage change, no bulk assign |
| **Deal Forecast** | ❌ Missing | No pipeline value forecast by stage probability |
| **Email Integration** | ❌ Missing | No email sync for deal communication |
| **Deal Loss Reason** | ❌ Missing | No structured loss reason tracking |
| **Custom Fields** | ❌ Missing | No custom field support on deals |
| **Deal Attachments** | ❌ Missing | No file attachment on deals |

## Gap Analysis

### Critical Gaps (None)
All HubSpot-lite core features are implemented. A business can:
- Track leads → create deals → move through pipeline → log activities → win/loss

### Nice-to-Have Gaps (Not Blocking)

| Gap | Effort | Impact |
|-----|--------|--------|
| CRM-wide search | Low | Useful but not critical |
| Bulk stage change | Low | Useful for migration |
| Pipeline forecast | Medium | Valuable for sales planning |
| Loss reason tracking | Low | Useful for win/loss analysis |
| Custom fields | High | Dangerous scope creep — skip for now |

## Recommendations

### Do Now (Low Effort)
1. **Add loss reason tracking** — When a deal is marked "lost", prompt for a reason. Store in `notes` or add a `lostReason` column.
2. **Add search** — Add `?search=` query param to `GET /api/crm` for CRM-wide search.

### Don't Do (Scope Creep)
- Custom fields (would require dynamic schema changes)
- Email integration (separate product)
- File attachments (complex, low ROI)

## Verdict

**CRM is production-ready for HubSpot-lite.** A paying customer can manage their full sales pipeline. The missing features are nice-to-haves, not launch blockers.

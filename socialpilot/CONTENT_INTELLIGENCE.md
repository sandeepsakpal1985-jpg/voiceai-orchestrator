# MetaPilot AI — Content Intelligence

> Generated: June 1, 2026
> Scope: Top 10 Posts Dashboard — performance metrics and lead attribution

---

## Overview

The Content Intelligence module provides a **Top 10 Posts Dashboard** that analyzes comment data to identify which Instagram and Facebook posts are driving the most engagement and lead generation.

---

## How It Works

Since Meta's Graph API requires specific business-level permissions for post-level analytics (reach, impressions, likes, shares), the content intelligence system uses **comment data as a proxy** for engagement:

| Metric | Source | Accuracy |
|---|---|---|
| Total Comments | `SocialComment` records grouped by `postId` | ✅ Exact |
| Unique Commenters | Distinct `authorName` values per post | ✅ Exact |
| Positive Sentiment | Comments with `sentiment > 0.3` | ✅ From AI classification |
| Negative Sentiment | Comments with `sentiment < -0.3` | ✅ From AI classification |
| Leads Generated | Comments with `leadScore >= 50` | ✅ From AI classification |
| Engagement Score | Weighted: comments(3x) + unique commenters(5x) + positive(10x) + leads(20x) | ✅ Calculated |
| Estimated Reach | `totalComments * 50` (approximation) | ⚠️ Approximate |
| Estimated Likes | `totalComments * 0.4` (approximation) | ⚠️ Approximate |
| Estimated Shares | `totalComments * 0.1` (approximation) | ⚠️ Approximate |

---

## API Endpoints

### `GET /api/content/top-posts`

Returns the top 10 posts by engagement score.

**Query Parameters:**
- `period` — `7d`, `30d` (default), `90d`
- `platform` — `all` (default), `instagram`, `facebook`
- `limit` — number of posts (default `10`)

**Response:**
```json
{
  "success": true,
  "data": {
    "posts": [
      {
        "postId": "string",
        "platform": "instagram",
        "totalComments": 42,
        "uniqueCommenters": 28,
        "positiveSentiment": 15,
        "negativeSentiment": 3,
        "leadsGenerated": 8,
        "sentimentScore": 29,
        "engagementScore": 275,
        "estimatedReach": 2100,
        "estimatedLikes": 17,
        "estimatedShares": 4,
        "engagementRate": 2
      }
    ],
    "period": "30d",
    "platform": "all",
    "summary": {
      "totalPosts": 10,
      "totalComments": 156,
      "totalLeads": 34,
      "avgEngagementScore": 180,
      "topPostId": "...",
      "topPostEngagement": 275
    }
  }
}
```

### `GET /api/content/posts/:postId`

Returns detailed analytics for a single post, including all comments.

---

## Dashboard Features

The frontend Content Intelligence page (`/content`) displays:

1. **Period/Platform Filters** — Toggle between 7d/30d/90d and all/Instagram/Facebook
2. **Summary Cards** — Total posts analyzed, comments, leads generated, avg engagement score
3. **Top 10 Table** — Ranked list with platform badge, comment count, unique commenters, estimated reach/likes, leads, sentiment arrow, engagement bar
4. **Post Performance Cards** — 6 detail cards showing comments, leads, score, likes, shares, engagement rate

---

## Future Enhancements

When Meta Graph API business-level access is available:
- Replace estimated metrics with actual reach, likes, saves, shares
- Add follower growth (gained/lost/net/growth %)
- Add story analytics (views, replies, exits)
- Add ad performance (spend, ROAS, conversions)

---

## Verification

| Check | Status |
|---|---|
| Top 10 posts by engagement | ✅ Implemented |
| Per-post comment count | ✅ From grouped SocialComment records |
| Per-post lead generation | ✅ From leadScore field |
| Per-post sentiment | ✅ From sentiment field |
| Platform filtering | ✅ Instagram / Facebook / All |
| Period filtering | ✅ 7d / 30d / 90d |
| Single post detail view | ✅ Endpoint exists |
| Frontend dashboard | ✅ `/content` page with table + cards |
| Sidebar navigation | ✅ Added "Content" link |

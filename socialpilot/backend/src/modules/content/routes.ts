/**
 * MetaPilot AI — Content Intelligence Module
 *
 * Provides analytics on top-performing content (Instagram + Facebook posts).
 * Uses stored comment data to infer post performance metrics.
 * In production, this would also call Meta Graph API for reach/likes/shares.
 */

import { FastifyPluginAsync } from 'fastify';

const contentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate as any);

  // Top 10 Posts Dashboard
  fastify.get('/top-posts', async (request) => {
    const { userId } = await (request as any).authenticate();
    const q = request.query as { platform?: string; period?: string; limit?: string };

    const limit = parseInt(q.limit || '10');
    const platform = q.platform || 'all';
    const period = q.period || '30d';

    const now = new Date();
    let startDate: Date;
    switch (period) {
      case '7d': startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
      case '30d': startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); break;
      case '90d': startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); break;
      default: startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Aggregate comments by postId to infer post performance
    const where: any = {
      userId,
      createdAt: { gte: startDate },
    };
    if (platform !== 'all') where.platform = platform;

    const comments = await fastify.prisma.socialComment.findMany({
      where,
      select: {
        postId: true,
        platform: true,
        content: true,
        sentiment: true,
        leadScore: true,
        authorName: true,
        createdAt: true,
        replyStatus: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group comments by postId
    const postMap: Record<string, {
      postId: string;
      platform: string;
      totalComments: number;
      uniqueCommenters: Set<string>;
      positiveCount: number;
      negativeCount: number;
      leadsGenerated: number;
      avgSentiment: number;
      latestComment: Date;
    }> = {};

    for (const c of comments) {
      if (!c.postId) continue;
      if (!postMap[c.postId]) {
        postMap[c.postId] = {
          postId: c.postId,
          platform: c.platform,
          totalComments: 0,
          uniqueCommenters: new Set(),
          positiveCount: 0,
          negativeCount: 0,
          leadsGenerated: 0,
          avgSentiment: 0,
          latestComment: c.createdAt,
        };
      }
      const p = postMap[c.postId];
      p.totalComments++;
      if (c.authorName) p.uniqueCommenters.add(c.authorName);
      if (c.sentiment !== null) {
        if (c.sentiment > 0.3) p.positiveCount++;
        else if (c.sentiment < -0.3) p.negativeCount++;
      }
      if (c.leadScore && c.leadScore >= 50) p.leadsGenerated++;
      if (c.createdAt > p.latestComment) p.latestComment = c.createdAt;
    }

    // Calculate engagement score and sort
    const posts = Object.values(postMap)
      .map(p => {
        // Engagement score: weighted combination of comments, unique commenters, sentiment, leads
        const engagementScore = Math.round(
          (p.totalComments * 3) +
          (p.uniqueCommenters.size * 5) +
          (p.positiveCount * 10) +
          (p.leadsGenerated * 20)
        );
        const sentimentScore = p.totalComments > 0
          ? Math.round(((p.positiveCount - p.negativeCount) / p.totalComments) * 100)
          : 0;

        return {
          postId: p.postId,
          platform: p.platform,
          totalComments: p.totalComments,
          uniqueCommenters: p.uniqueCommenters.size,
          positiveSentiment: p.positiveCount,
          negativeSentiment: p.negativeCount,
          leadsGenerated: p.leadsGenerated,
          sentimentScore,
          engagementScore,
          latestActivity: p.latestComment.toISOString(),
          // Mock reach/likes/shares derived from engagement (in production, call Meta Graph API)
          estimatedReach: p.totalComments * 50,
          estimatedLikes: Math.round(p.totalComments * 0.4),
          estimatedShares: Math.round(p.totalComments * 0.1),
          engagementRate: Math.round((p.totalComments / Math.max(p.totalComments * 50, 1)) * 100),
        };
      })
      .sort((a, b) => b.engagementScore - a.engagementScore)
      .slice(0, limit);

    // Calculate aggregate stats
    const totalEngagement = posts.reduce((sum, p) => sum + p.engagementScore, 0);
    const totalLeads = posts.reduce((sum, p) => sum + p.leadsGenerated, 0);
    const totalComments = posts.reduce((sum, p) => sum + p.totalComments, 0);

    return {
      success: true,
      data: {
        posts,
        period,
        platform,
        summary: {
          totalPosts: posts.length,
          totalComments,
          totalLeads,
          avgEngagementScore: posts.length > 0 ? Math.round(totalEngagement / posts.length) : 0,
          topPostId: posts[0]?.postId || null,
          topPostEngagement: posts[0]?.engagementScore || 0,
        },
        generatedAt: new Date().toISOString(),
      },
    };
  });

  // Single post detail
  fastify.get('/posts/:postId', async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { postId } = request.params as { postId: string };

    const comments = await fastify.prisma.socialComment.findMany({
      where: { userId, postId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        platform: true,
        authorName: true,
        content: true,
        sentiment: true,
        leadScore: true,
        replyStatus: true,
        createdAt: true,
      },
    });

    if (comments.length === 0) {
      return reply.status(404).send({ success: false, error: 'Post not found' });
    }

    const totalComments = comments.length;
    const uniqueCommenters = new Set(comments.map(c => c.authorName).filter(Boolean)).size;
    const positive = comments.filter(c => c.sentiment !== null && c.sentiment > 0.3).length;
    const negative = comments.filter(c => c.sentiment !== null && c.sentiment < -0.3).length;
    const leads = comments.filter(c => c.leadScore !== null && c.leadScore >= 50).length;

    return {
      success: true,
      data: {
        postId,
        platform: comments[0].platform,
        totalComments,
        uniqueCommenters,
        sentimentBreakdown: {
          positive,
          neutral: totalComments - positive - negative,
          negative,
        },
        leadsGenerated: leads,
        comments: comments.slice(0, 50).map(c => ({
          id: c.id,
          author: c.authorName,
          content: c.content,
          sentiment: c.sentiment,
          leadScore: c.leadScore,
          replyStatus: c.replyStatus,
          createdAt: c.createdAt.toISOString(),
        })),
      },
    };
  });
};

export default contentRoutes;

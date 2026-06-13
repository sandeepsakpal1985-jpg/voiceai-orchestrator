import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { config } from '../../config';
import { MetaWebhookProcessor } from '../../services/webhook/meta-processor';
import { captureEvent, Events } from '../../services/analytics/posthog';

const META_API_VERSION = 'v21.0';
const META_GRAPH_URL = `https://graph.facebook.com/${META_API_VERSION}`;

/**
 * Build the Meta OAuth redirect URL for Instagram or Facebook.
 */
function buildMetaAuthUrl(platform: 'instagram' | 'facebook', state: string): string {
  const redirectUri = config.meta.callbackUrl;
  
  const scopes: Record<string, string[]> = {
    instagram: [
      'instagram_basic',
      'instagram_content_publish',
      'instagram_manage_comments',
      'instagram_manage_messages',
      'pages_read_engagement',
      'pages_manage_metadata',
    ],
    facebook: [
      'pages_read_engagement',
      'pages_manage_posts',
      'pages_manage_metadata',
      'pages_manage_comments',
      'pages_messaging',
    ],
  };

  const params = new URLSearchParams({
    client_id: config.meta.appId,
    redirect_uri: redirectUri,
    state,
    scope: scopes[platform].join(','),
    response_type: 'code',
  });

  return `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?${params.toString()}`;
}

/**
 * Exchange an authorization code for a short-lived access token.
 */
async function exchangeCodeForToken(code: string): Promise<{
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}> {
  const params = new URLSearchParams({
    client_id: config.meta.appId,
    client_secret: config.meta.appSecret,
    redirect_uri: config.meta.callbackUrl,
    code,
  });

  const res = await fetch(`${META_GRAPH_URL}/oauth/access_token?${params.toString()}`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }
  return res.json();
}

/**
 * Exchange a short-lived token for a long-lived (60-day) token.
 */
async function exchangeForLongLivedToken(shortLivedToken: string): Promise<{
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: config.meta.appId,
    client_secret: config.meta.appSecret,
    fb_exchange_token: shortLivedToken,
  });

  const res = await fetch(`${META_GRAPH_URL}/oauth/access_token?${params.toString()}`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Long-lived token exchange failed: ${err}`);
  }
  return res.json();
}

/**
 * Get the authenticated user's Facebook Pages.
 */
async function getUserPages(accessToken: string): Promise<Array<{ id: string; name: string; access_token: string }>> {
  const params = new URLSearchParams({
    access_token: accessToken,
    fields: 'id,name,access_token',
    limit: '100',
  });

  const res = await fetch(`${META_GRAPH_URL}/me/accounts?${params.toString()}`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get user pages: ${err}`);
  }
  const data = await res.json();
  return data.data || [];
}

/**
 * Get Instagram Business Account connected to a Facebook Page.
 */
async function getInstagramBusinessAccount(pageId: string, pageAccessToken: string): Promise<{ id: string; username: string } | null> {
  const params = new URLSearchParams({
    access_token: pageAccessToken,
    fields: 'instagram_business_account{id,username}',
  });

  const res = await fetch(`${META_GRAPH_URL}/${pageId}?${params.toString()}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.instagram_business_account || null;
}

const metaRoutes: FastifyPluginAsync = async (fastify) => {
  // ── OAuth Initiation (unauthenticated — token passed via state) ──
  fastify.get('/auth', async (request, reply) => {
    const query = request.query as Record<string, string>;
    const platform = query.platform as 'instagram' | 'facebook';
    const token = query.token;

    if (!platform || !['instagram', 'facebook'].includes(platform)) {
      return reply.status(400).send({ success: false, error: 'Invalid platform. Use "instagram" or "facebook".' });
    }

    if (!token) {
      return reply.status(401).send({ success: false, error: 'Authentication token required.' });
    }

    // Verify the JWT and extract userId for the state
    let userId: string;
    try {
      const decoded = fastify.jwt.verify(token) as { id: string };
      userId = decoded.id;
    } catch {
      return reply.status(401).send({ success: false, error: 'Invalid or expired token.' });
    }

    if (!config.meta.appId || !config.meta.appSecret) {
      return reply.status(503).send({
        success: false,
        error: 'Meta OAuth is not configured. Set META_APP_ID and META_APP_SECRET in your .env file.',
      });
    }

    // Build state: JSON with userId + platform + random nonce
    // HMAC-signed with META_APP_SECRET to prevent tampering.
    // The signature prevents attackers from modifying the userId in the state
    // parameter to hijack another user's OAuth connection.
    const stateData = JSON.stringify({
      userId,
      platform,
      nonce: crypto.randomBytes(8).toString('hex'),
    });
    const stateSignature = crypto
      .createHmac('sha256', config.meta.appSecret || config.jwt.secret)
      .update(stateData)
      .digest('hex');
    const state = Buffer.from(
      JSON.stringify({ data: stateData, sig: stateSignature })
    ).toString('base64url');

    const authUrl = buildMetaAuthUrl(platform, state);
    return reply.redirect(302, authUrl);
  });

  // ── OAuth Callback ──
  fastify.get('/callback', async (request, reply) => {
    const query = request.query as Record<string, string>;
    const code = query.code;
    const stateParam = query.state;
    const error = query.error;
    const errorReason = query.error_reason;
    const errorDescription = query.error_description;

    // Handle user-denied error
    if (error) {
      fastify.log.warn('Meta OAuth denied: %s — %s', errorReason || error, errorDescription || '');
      return reply.redirect(302, `${config.frontendUrl}/onboarding?meta_error=${encodeURIComponent(errorDescription || error)}`);
    }

    if (!code || !stateParam) {
      return reply.status(400).send({ success: false, error: 'Missing code or state parameter.' });
    }

    // Decode and verify state
    let state: { userId: string; platform: 'instagram' | 'facebook'; nonce: string };
    try {
      const decoded = JSON.parse(Buffer.from(stateParam, 'base64url').toString());
      // Verify HMAC signature to prevent tampering
      const expectedSig = crypto
        .createHmac('sha256', config.meta.appSecret || config.jwt.secret)
        .update(decoded.data)
        .digest('hex');
      if (expectedSig !== decoded.sig) {
        fastify.log.warn('OAuth state signature mismatch — possible tampering attempt');
        return reply.status(400).send({ success: false, error: 'Invalid state parameter.' });
      }
      state = JSON.parse(decoded.data);
    } catch {
      return reply.status(400).send({ success: false, error: 'Invalid state parameter.' });
    }

    const { userId, platform } = state;

    try {
      // Step 1: Exchange code for short-lived token
      const tokenData = await exchangeCodeForToken(code);

      // Step 2: Exchange for long-lived token
      const longLived = await exchangeForLongLivedToken(tokenData.accessToken);
      const accessToken = longLived.accessToken;
      const expiresAt = new Date(Date.now() + longLived.expiresIn * 1000);

      // Step 3: Get user's Facebook Pages
      const pages = await getUserPages(accessToken);
      if (pages.length === 0) {
        return reply.redirect(
          302,
          `${config.frontendUrl}/onboarding?meta_error=${encodeURIComponent('No Facebook Pages found. Create a Facebook Page first.')}`
        );
      }

      // Use the first page
      const primaryPage = pages[0];

      if (platform === 'instagram') {
        // Get Instagram Business Account connected to the page
        const igAccount = await getInstagramBusinessAccount(primaryPage.id, primaryPage.access_token);

        const connectionData: any = {
          userId,
          facebookPageId: primaryPage.id,
          facebookPageName: primaryPage.name,
          accessToken,
          tokenExpiresAt: expiresAt,
          status: 'active',
        };

        if (igAccount) {
          connectionData.instagramAccountId = igAccount.id;
          connectionData.instagramUsername = igAccount.username;
        }

        // Check for existing connection
        const existing = await fastify.prisma.metaConnection.findFirst({
          where: { userId, instagramAccountId: igAccount?.id || undefined },
        });

        if (existing) {
          await fastify.prisma.metaConnection.update({
            where: { id: existing.id },
            data: connectionData,
          });
        } else {
          await fastify.prisma.metaConnection.create({ data: connectionData });
        }

        // Track Instagram connection
        captureEvent(userId, Events.META_CONNECTED, { platform: 'instagram', hasIgAccount: !!igAccount });

        return reply.redirect(302, `${config.frontendUrl}/onboarding?meta_connected=instagram`);
      } else {
        // Facebook: store the page connection
        const connectionData = {
          userId,
          facebookPageId: primaryPage.id,
          facebookPageName: primaryPage.name,
          accessToken,
          tokenExpiresAt: expiresAt,
          status: 'active',
        };

        const existing = await fastify.prisma.metaConnection.findFirst({
          where: { userId, facebookPageId: primaryPage.id },
        });

        if (existing) {
          await fastify.prisma.metaConnection.update({
            where: { id: existing.id },
            data: connectionData,
          });
        } else {
          await fastify.prisma.metaConnection.create({ data: connectionData });
        }

        // Track Facebook connection
        captureEvent(userId, Events.META_CONNECTED, { platform: 'facebook' });

        return reply.redirect(302, `${config.frontendUrl}/onboarding?meta_connected=facebook`);
      }
    } catch (err: any) {
      fastify.log.error('Meta OAuth callback error: %s', err?.message || err);
      return reply.redirect(
        302,
        `${config.frontendUrl}/onboarding?meta_error=${encodeURIComponent(err?.message || 'OAuth callback failed')}`
      );
    }
  });

  // Webhook verification (GET - Meta sends this to verify)
  fastify.get('/webhook', async (request, reply) => {
    const query = request.query as Record<string, string>;
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];
    
    if (mode === 'subscribe' && token === config.meta.webhookVerifyToken) {
      reply.type('text/plain');
      return challenge;
    }
    return reply.status(403).send('Verification failed');
  });

  // Webhook events (POST - Meta sends events here)
  fastify.post('/webhook', async (request, reply) => {
    const body = request.body as any;
    
    // ── X-Hub-Signature Verification ──
    // Meta signs every webhook payload using HMAC-SHA256 with the App Secret.
    // Without this check, anyone who discovers the webhook URL can POST fake events.
    if (config.meta.appSecret) {
      const signature = request.headers['x-hub-signature-256'] as string;
      if (!signature) {
        fastify.log.warn('Webhook rejected: missing X-Hub-Signature-256 header');
        return reply.status(401).send('Missing signature');
      }

      // Note: Uses JSON.stringify(body) since Fastify doesn't preserve raw body by default.
      // For production, consider a content-type parser that buffers the raw body.
      const bodyStr = JSON.stringify(body);
      const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', config.meta.appSecret)
        .update(bodyStr)
        .digest('hex');

      // Use timing-safe comparison to prevent timing attacks
      try {
        if (
          signature.length !== expectedSignature.length ||
          !crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature),
          )
        ) {
          fastify.log.warn('Webhook rejected: invalid X-Hub-Signature-256');
          return reply.status(401).send('Invalid signature');
        }
      } catch (sigErr) {
        fastify.log.warn('Webhook rejected: signature comparison error — %s', sigErr);
        return reply.status(401).send('Signature verification error');
      }

      fastify.log.debug('Webhook signature verified successfully');
    } else {
      fastify.log.warn('Webhook signature verification disabled — set META_APP_SECRET to enable');
    }
    
    // Process through the webhook processor
    // This parses entries, identifies comments/DMs, creates records, and queues jobs
    const processor = new MetaWebhookProcessor(fastify.prisma);
    const result = await processor.process(body);
    
    if (result.errors > 0) {
      fastify.log.warn('Webhook processed with %d errors', result.errors);
    }
    
    fastify.log.info(
      'Webhook processed: %d events (%d comments, %d DMs, %d mentions)',
      result.processed, result.comments, result.dms, result.mentions
    );
    
    return reply.status(200).send('EVENT_RECEIVED');
  });

  // ── Authenticated routes ──
  // Note: We add preHandler auth to individual routes instead of using a global
  // addHook, because the webhook and OAuth routes above must remain unauthenticated
  // (Meta sends webhooks directly, and OAuth callback is a redirect).

  // Get connections
  fastify.get('/connections', { preHandler: [fastify.authenticate as any] }, async (request) => {
    const { userId } = await (request as any).authenticate();
    const connections = await fastify.prisma.metaConnection.findMany({
      where: { userId },
    });
    return { success: true, data: connections };
  });

  // Connect Instagram (programmatic fallback — for custom flows)
  fastify.post('/instagram/connect', { preHandler: [fastify.authenticate as any] }, async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const schema = z.object({
      instagramAccountId: z.string(),
      instagramUsername: z.string(),
      accessToken: z.string(),
      tokenExpiresAt: z.string(),
    });
    const body = schema.parse(request.body);
    
    const connection = await fastify.prisma.metaConnection.create({
      data: { userId, ...body, tokenExpiresAt: new Date(body.tokenExpiresAt) },
    });
    return { success: true, data: connection };
  });

  // Connect Facebook (programmatic fallback — for custom flows)
  fastify.post('/facebook/connect', { preHandler: [fastify.authenticate as any] }, async (request) => {
    const { userId } = await (request as any).authenticate();
    const schema = z.object({
      facebookPageId: z.string(),
      facebookPageName: z.string(),
      accessToken: z.string(),
      tokenExpiresAt: z.string(),
    });
    const body = schema.parse(request.body);
    
    const connection = await fastify.prisma.metaConnection.create({
      data: { userId, ...body, tokenExpiresAt: new Date(body.tokenExpiresAt) },
    });
    return { success: true, data: connection };
  });

  // Disconnect
  fastify.delete('/connections/:id', { preHandler: [fastify.authenticate as any] }, async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    
    const conn = await fastify.prisma.metaConnection.findFirst({
      where: { id, userId },
    });
    if (!conn) return reply.status(404).send({ success: false, error: 'Connection not found' });      await fastify.prisma.metaConnection.delete({ where: { id } });

    // Track disconnection
    captureEvent(userId, Events.META_DISCONNECTED, {
      platform: conn.instagramAccountId ? 'instagram' : 'facebook',
    });

    return { success: true, data: { deleted: true } };
  });

  // Refresh token
  fastify.post('/connections/:id/refresh', { preHandler: [fastify.authenticate as any] }, async (request, reply) => {
    const { userId } = await (request as any).authenticate();
    const { id } = request.params as { id: string };
    
    const conn = await fastify.prisma.metaConnection.findFirst({
      where: { id, userId },
    });
    if (!conn) return reply.status(404).send({ success: false, error: 'Connection not found' });
    
    try {
      // Exchange the existing long-lived token for a new one
      const newToken = await exchangeForLongLivedToken(conn.accessToken);
      
      await fastify.prisma.metaConnection.update({
        where: { id },
        data: {
          accessToken: newToken.accessToken,
          tokenExpiresAt: new Date(Date.now() + newToken.expiresIn * 1000),
        },
      });
      
      // Track token refresh
      captureEvent(userId, Events.META_TOKEN_REFRESHED, { platform: conn.instagramAccountId ? 'instagram' : 'facebook' });

      return { success: true, data: { refreshed: true } };
    } catch (err: any) {
      fastify.log.error('Token refresh failed: %s', err?.message || err);
      return reply.status(502).send({ success: false, error: 'Token refresh failed. Please reconnect.' });
    }
  });
};

export default metaRoutes;

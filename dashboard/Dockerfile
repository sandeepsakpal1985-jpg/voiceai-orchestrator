# ============================================================================
# VoiceAI Dashboard — Production Docker Build
#
# Build:
#   docker build -t voiceai-dashboard .
#
# Run (standalone Next.js):
#   docker run -p 3000:3000 voiceai-dashboard
#
# Run (with WebSocket server via docker-compose):
#   docker-compose up
# ============================================================================

# ── Stage 1: Dependencies ─────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --only=production

# ── Stage 2: Build ────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json next.config.ts ./
COPY src/ ./src/
COPY server/ ./server/
COPY prisma/ ./prisma/
COPY prisma.config.ts ./

# Generate Prisma client
RUN npx prisma generate

# Build Next.js
RUN npm run build

# ── Stage 3: Production Runner ────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built assets
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/server ./server

# Prisma client for migrations
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/src/generated ./src/generated

USER nextjs

EXPOSE 3000

ENV PORT=3000

CMD ["node", "server.js"]

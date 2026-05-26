# ============================================================================
# VoiceAI Dashboard — WebSocket Server Docker Build
# ============================================================================

FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY server/ ./server/
COPY src/ ./src/
COPY prisma/ ./prisma/
COPY prisma.config.ts ./

RUN npx prisma generate

# ── Runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server ./server
COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/tsconfig.json ./

USER nodejs

EXPOSE 3001

ENV WS_PORT=3001

CMD ["npx", "tsx", "server/ws-server.ts"]

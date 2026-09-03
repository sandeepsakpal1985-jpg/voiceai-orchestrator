FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
ENV CI=true
RUN corepack prepare pnpm@11.5.0 --activate
RUN pnpm install --frozen-lockfile --config.strict-dep-builds=false || pnpm install --config.strict-dep-builds=false
RUN pnpm rebuild argon2 @prisma/client prisma @prisma/engines esbuild
RUN pnpm --filter @klunex-edu/shared build
RUN pnpm --filter @klunex-edu/database generate
RUN pnpm --filter @klucoach/api build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S klucoach && adduser -S klucoach -G klucoach
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml* ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
USER klucoach
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
WORKDIR /app/apps/api
CMD ["node", "dist/index.js"]

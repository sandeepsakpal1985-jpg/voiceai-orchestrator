FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @klunex-edu/database generate
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["pnpm", "exec", "tsx", "src/index.ts"]

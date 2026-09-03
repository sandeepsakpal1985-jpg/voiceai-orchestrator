FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
ENV CI=true
RUN corepack prepare pnpm@11.5.0 --activate
RUN pnpm install --frozen-lockfile --config.strict-dep-builds=false || pnpm install --config.strict-dep-builds=false
RUN pnpm rebuild esbuild
RUN pnpm --filter @klucoach/web build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/ || exit 1

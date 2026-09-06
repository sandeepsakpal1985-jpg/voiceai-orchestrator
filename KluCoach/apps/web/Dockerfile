FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web
ENV CI=true
RUN corepack prepare pnpm@11.5.0 --activate
RUN pnpm install --frozen-lockfile --filter @klucoach/web... --config.strict-dep-builds=false || pnpm install --filter @klucoach/web... --config.strict-dep-builds=false
RUN pnpm rebuild esbuild
WORKDIR /app/apps/web
ENV PATH="/app/apps/web/node_modules/.bin:/app/node_modules/.bin:${PATH}"
RUN tsc --noEmit && vite build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
RUN chown -R nginx:nginx /usr/share/nginx/html
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/ || exit 1

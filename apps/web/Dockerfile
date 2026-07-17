FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
COPY tools ./tools

RUN corepack pnpm install --frozen-lockfile
RUN corepack pnpm --filter @douyin-local-life/shared build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN corepack pnpm --filter @douyin-local-life/web build

FROM node:22-alpine AS runtime

ARG NEXT_PUBLIC_API_URL
ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
WORKDIR /app
RUN addgroup -S app && adduser -S -G app -h /app app

COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build --chown=app:app /app/apps/web ./apps/web
COPY --from=build --chown=app:app /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=app:app /app/packages/shared/dist ./packages/shared/dist

USER app
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]

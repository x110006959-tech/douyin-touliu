FROM node:22-alpine AS build

ARG GIT_SHA=""
ARG BUILD_TIME=""
ARG SCHEMA_VERSION="20260717_v029_email_verification"

ENV GIT_SHA=$GIT_SHA
ENV BUILD_TIME=$BUILD_TIME
ENV SCHEMA_VERSION=$SCHEMA_VERSION

RUN apk add --no-cache openssl
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY prisma ./prisma
COPY apps/api ./apps/api
COPY packages/shared ./packages/shared
COPY packages/llm ./packages/llm
COPY packages/decision-engine ./packages/decision-engine
COPY tools ./tools

RUN corepack pnpm install --frozen-lockfile
RUN corepack pnpm prisma:generate
RUN corepack pnpm --filter @douyin-local-life/shared --filter @douyin-local-life/llm --filter @douyin-local-life/decision-engine build
RUN corepack pnpm --filter @douyin-local-life/api build

FROM node:22-alpine AS runtime

ARG GIT_SHA=""
ARG BUILD_TIME=""
ARG SCHEMA_VERSION="20260717_v029_email_verification"

ENV NODE_ENV=production
ENV GIT_SHA=$GIT_SHA
ENV BUILD_TIME=$BUILD_TIME
ENV SCHEMA_VERSION=$SCHEMA_VERSION

RUN apk add --no-cache openssl && addgroup -S app && adduser -S -G app -h /app app
WORKDIR /app
RUN corepack enable

COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/package.json ./package.json
COPY --from=build --chown=app:app /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build --chown=app:app /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=app:app /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=app:app /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=app:app /app/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=app:app /app/packages/llm/package.json ./packages/llm/package.json
COPY --from=build --chown=app:app /app/packages/llm/dist ./packages/llm/dist
COPY --from=build --chown=app:app /app/packages/decision-engine/package.json ./packages/decision-engine/package.json
COPY --from=build --chown=app:app /app/packages/decision-engine/dist ./packages/decision-engine/dist

USER app
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]

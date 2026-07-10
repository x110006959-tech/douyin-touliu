FROM node:22-alpine

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

EXPOSE 4000
CMD ["sh", "-c", "corepack pnpm exec prisma db push --skip-generate && corepack pnpm --filter @douyin-local-life/api start"]

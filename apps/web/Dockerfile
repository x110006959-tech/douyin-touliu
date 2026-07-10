FROM node:22-alpine

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

EXPOSE 3000
CMD ["corepack", "pnpm", "--filter", "@douyin-local-life/web", "start"]

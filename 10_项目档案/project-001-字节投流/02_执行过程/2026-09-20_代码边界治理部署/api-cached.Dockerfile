FROM pxxis-api:server-diagnosis-insights-v32-20260919 AS build
USER root
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY prisma ./prisma
COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/tsconfig.json
COPY tools/clean-dist.mjs ./tools/clean-dist.mjs

ENV GIT_SHA=ae027be8cf47
ENV BUILD_TIME=2026-09-20T00:00:00.000Z
ENV SCHEMA_VERSION=20260731_v035_ai_skill_diagnosis

RUN node node_modules/prisma/build/index.js generate
RUN node tools/clean-dist.mjs packages/shared/dist && node packages/shared/node_modules/typescript/bin/tsc -p packages/shared/tsconfig.json
RUN node tools/clean-dist.mjs apps/api/dist && node apps/api/node_modules/typescript/bin/tsc -p apps/api/tsconfig.json
RUN node -e "import('./apps/api/dist/server.js')"

USER app
CMD ["node", "apps/api/dist/index.js"]

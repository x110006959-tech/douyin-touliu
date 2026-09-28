FROM pxxis-api:code-boundaries-v33-20260920 AS shared
FROM pxxis-web:server-diagnosis-insights-v32-20260919 AS build
USER root
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
RUN rm -rf /app/apps/web/src /app/apps/web/.next
COPY apps/web ./apps/web
COPY --from=shared /app/packages/shared/dist ./packages/shared/dist
RUN rm -rf /app/node_modules/zod && cp -R /app/node_modules/.pnpm/zod@3.25.76/node_modules/zod /app/node_modules/zod && \
    test -f /app/node_modules/zod/index.js

ENV NEXT_PUBLIC_API_URL=http://127.0.0.1:4300
WORKDIR /app/apps/web
RUN node node_modules/next/dist/bin/next build
RUN chown -R app:app /app/apps/web/.next

USER app
CMD ["node", "node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]

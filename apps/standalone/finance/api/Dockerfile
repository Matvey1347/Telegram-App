FROM node:20.19.0-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY . .

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && npm_config_nodedir=/usr/local pnpm install --frozen-lockfile \
    && apt-get purge -y --auto-remove python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

RUN pnpm --filter finance-api prisma:generate \
    && pnpm --filter finance-api build

RUN test -f /app/apps/standalone/finance/api/dist/main.js

CMD ["node", "/app/apps/standalone/finance/api/dist/main.js"]

FROM node:20.19.0-bookworm-slim

WORKDIR /app

RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile

RUN DATABASE_URL='postgresql://build:build@localhost:5432/build' \
    pnpm --filter api exec prisma generate \
    && pnpm --filter @telegram-system/shared build \
    && pnpm --filter api build \
    && NEXT_PUBLIC_API_URL=/api RAILWAY_API_PROXY=true pnpm --filter web build

CMD ["node", "scripts/start-railway.mjs"]

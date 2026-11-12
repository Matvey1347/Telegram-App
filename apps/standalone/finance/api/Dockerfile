FROM node:20.19.0-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile

RUN pnpm --filter finance-api prisma:generate \
    && pnpm --filter finance-api build

CMD ["pnpm", "--filter", "finance-api", "start:prod"]

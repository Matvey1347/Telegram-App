# Lead Discovery local offline configuration

The companion `local-offline.env.example` is a parameter template, not a ready-to-run command or a source of credentials. It describes an empty local environment; do not load a production `.env` into it.

## Required values for offline preparation

- `DATABASE_URL`: a new disposable PostgreSQL instance/database on `127.0.0.1`, with a local-only role and port. Do not use an existing URL whose environment is uncertain.
- `JWT_SECRET`: new random local signing value, used for the test user only.
- `BOT_TOKEN_ENCRYPTION_KEY`: new random value containing exactly 32 bytes, base64 encoded. The API requires it at startup even without bots. Never copy an existing encryption key.
- `PORT`, `FRONTEND_URL`, `NEXT_PUBLIC_API_URL`: unused local ports and matching loopback URLs. The API currently listens on `0.0.0.0`; restrict ingress with the OS firewall or sandbox and do not expose it to the network. Bind the web server to `127.0.0.1`.
- `CRM_RUNTIME_ENABLED=false`, `INTERNAL_AI_ENABLED=false`, an empty `INTERNAL_AI_OPENAI_API_KEY`, and `INTERNAL_LEAD_DISCOVERY_GRANTS='[]'`. Do not supply Telegram API ID/hash, account session, bot token, SMTP credentials or production keys. `INTERNAL_LEAD_DISCOVERY_ENABLED=true` exposes the feature but does not authorize any source.

Use the repository's `db:deploy:safe` against the explicitly identified local database. Important: both `apps/api/scripts/prisma-reconcile-baseline.mjs` and Prisma config load the repository root `.env` by path. An empty shell environment alone does not prevent this. To avoid reading existing credentials, execute the safe deployment from an isolated copy with the same `apps/api` relative layout, its Prisma schema/migrations/config and migration script, and local dependency links; verify that copy's root has no `.env`. Run the built API from an empty directory whose `../../.env` and `.env` do not exist, using only explicitly supplied offline variables. Do not point either process to the original root `.env`.

For a no-external-network check, enforce an OS-level network policy allowing only loopback for these processes; flags and absence of credentials alone do not prove no network activity. On the verified macOS host the sandbox profile was `(version 1) (allow default) (deny network-outbound) (allow network-outbound (remote ip "localhost:*"))`. Ensure a locally installed pnpm and dependencies are available before applying the policy, and use `COREPACK_ENABLE_NETWORK=0`; otherwise Corepack can attempt to contact the npm registry. The first Corepack attempt in this verification was blocked by the sandbox. A local cached pnpm was then used successfully. This macOS profile is platform-specific and is not a general cross-platform firewall recipe.

Start only one API instance and a separate web copy. Register a disposable user through the local auth endpoint and check health/auth locally. Shut down temporary API, web and PostgreSQL after verification. The offline setup cannot collect Telegram posts, create a Telegram source, or validate analysis of real posts.

## Additional inputs only after explicit authorization for Telegram staging

1. A separate non-production workspace and dedicated test Telegram account, with an approved test-only session, API ID/hash and the local key required to encrypt them. Do not reuse production accounts, sessions or secrets. Provision and connect only after separate permission.
2. One explicitly permitted channel and its canonical channel ID, account ID, workspace ID and normalized source key; the relevant actor's workspace membership and `adSales.leads` permissions.
3. An approved `policy:` or `consent:` processing reference and expiration, plus a scoped grant in `INTERNAL_LEAD_DISCOVERY_GRANTS` containing `workspaceId`, `sourceKey`, `accountId`, `channelId`, `reference`, UTC `expiresAt`, and `ingest`/`ai` booleans. `allowOwnChannel` is needed only when applicable. The current deterministic routing also requires the source `ai` processing grant; global `INTERNAL_AI_ENABLED` remains `false`, and no AI API key is supplied.
4. A permitted staging browser and one safe test message or a channel where new messages can be observed. Evidence examples absent from that channel remain untested. See `p3-staging-acceptance.md` for the acceptance checklist.

The local sandbox exercise proved migration, startup, local health, registration and authentication only. It does not establish real Telegram, network provenance, browser behavior, queue processing, candidates or production readiness.

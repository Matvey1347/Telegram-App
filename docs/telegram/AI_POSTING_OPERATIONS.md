# AI Posting: setup and operations

AI Posting uses the existing Operations AI Gateway, `AiOperation`, `AiUsage`, and `AiBudget` ledger. Per-channel and per-publication dimensions are attached to gateway operations; no parallel wallet or payment ledger is created. Provider-reported cost is used when available. Missing provider pricing remains `UNKNOWN/UNPRICED` and is not presented as zero. The ledger reserves budget for unpriced operations, preventing further paid work while the amount is unresolved.

## Environment

Configure these values in the normal local or deployment environment (never commit secrets):

| Variable | Required for | Notes |
| --- | --- | --- |
| `DATABASE_URL` | API and migrations | PostgreSQL connection string. |
| `INTERNAL_AI_ENABLED` | AI Gateway | Set `true` to enable the existing gateway. |
| `INTERNAL_AI_OPENAI_API_KEY` | OpenAI Gateway | Secret for the configured OpenAI provider. Models and price registry are configured through existing Operations > AI settings. |
| `B2_KEY_ID`, `B2_APP_KEY`, `B2_BUCKET_NAME`, `B2_ENDPOINT` | Stored generated media | Existing B2 media storage for generated images. Configure all four together. |
| `FRONTEND_URL` | Email links and notification URLs | Public/local Nexeloq web origin. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Email notifications | Optional unless Email delivery is selected. |
| `WEB_PUSH_VAPID_SUBJECT`, `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY` | PWA Push | Optional unless push delivery is selected. |
| `TELEGRAM_SYSTEM_BOT_ENVIRONMENT`, `TELEGRAM_SYSTEM_BOT_LOCAL_USERNAME`, `TELEGRAM_SYSTEM_BOT_LOCAL_TOKEN`, `TELEGRAM_SYSTEM_BOT_LOCAL_WEBHOOK_SECRET` | Local System Bot notifications | Select the environment and configure its matching credentials. Production variants use the corresponding `_PRODUCTION_` names. |

The OpenAI key is consumed only by the existing AI Gateway. Workspace and category enablement, provider/model selection, and workspace/category budget limits are configured in Operations > AI. AI Posting additionally accepts per-channel daily and monthly USD budgets; blank values leave the channel-specific cap unset while existing workspace/category caps continue to apply.

## Local setup

From the repository root:

```sh
pnpm install
pnpm db:up
pnpm db:migrate
pnpm db:generate
pnpm dev:nexeloq
```

`pnpm db:migrate` applies migrations to the database selected by the local `DATABASE_URL`; verify that it points to a local or development database first. Do not run this against production as part of local setup. Production migrations must be applied only through the approved release process.

## Runtime behavior

Autopilot creates and schedules ordinary `TelegramManagedPost` records through the existing planner and publication pipeline. It does not bypass the existing publication mechanism. Stop Autopilot to prevent further replenishment; existing drafts and scheduled posts remain intact. Daily/monthly AI limits block new paid generation after the applicable budget is exhausted, while already generated drafts and scheduled publications continue through the normal publishing path.

Analytics use the detailed `AiOperation` ledger, filtered by workspace, channel, date, mode, and AI category. The selectable range is limited to 90 days, matching the detailed-operation retention policy. Planning cost is allocated across the preview publications for per-post display while the underlying planning operation is counted once in aggregate ledger spend. Failed and retried operations remain part of spend when the provider reports a charge.

## Verification

The production UI is available at `https://www.nexeloq.com/ai-posting`. Sign
in with a Workspace account that has access to a Telegram channel; AI Posting
remains workspace-scoped and Autopilot is off until explicitly enabled.

Useful commands from the repository root:

```sh
pnpm db:generate
pnpm --filter api exec prisma validate
pnpm --filter api typecheck
pnpm --filter web typecheck
pnpm --filter api exec jest --runInBand telegram-ai-posting
pnpm --filter api exec jest --runInBand telegram-post-calendar-planner managed-post-publication channel-reminder-delivery
pnpm --filter web exec jest --runInBand ai-posting
```

For manual QA, configure one development channel and a low test budget, generate three test previews, edit and save one, enable Autopilot, confirm it reuses existing drafts before generating, inspect scheduled slots and AI Posting analytics, then observe publication through the existing publication worker. Use a test channel and credentials for any real Telegram publication. Failed paid generation and unknown provider pricing should appear in run history and analytics without being represented as `$0`.

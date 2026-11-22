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

The OpenAI key is consumed only by the existing AI Gateway. It is used for both text and image requests; there is no separate image-provider key in this integration. Workspace and category enablement, provider/model selection, and workspace/category budget limits are configured in Operations > AI. AI Posting additionally accepts per-channel daily and monthly USD budgets; blank values leave the channel-specific cap unset while existing workspace/category caps continue to apply. An administrator can explicitly enable “AI Posting без денежных лимитов” in Operations > AI for a workspace. This removes workspace, category, and channel monetary admission caps for AI Posting only, for both manual and enabled automatic work; other AI categories retain their caps. Usage and reservations remain recorded, and provider, concurrency, authorization, and automatic enablement checks still apply. Disabling the option restores the saved limits. AI Posting consumption continues to count in workspace spending totals.

Image behavior is selected per channel in AI Posting settings. **Found images** searches the enabled idea sources and does not call image generation if no usable image is found. **AI generation** generates through the existing `TELEGRAM_POSTING_IMAGE` Gateway category. **Hybrid** searches and validates candidates first, stores a usable result through B2, and falls back to AI generation only when no candidate passes checks. Broken external URLs are not saved to a post. B2 credentials are needed to persist generated/downloaded assets. The chosen media preference is stored with each new preview. For a preference with references, hybrid mode generates with its bounded reference sheet (up to eight images, each at most 2 MB) instead of choosing an unrelated stock image; media retries use the same preference. When the channel-avatar option is enabled, the stored avatar is applied as a watermark; a missing or unreadable avatar is reported rather than silently omitted. Historical previews without a saved preference are marked as unknown until media is regenerated.

### PWA Push setup

Generate one VAPID key pair for each isolated deployment/environment. From the repository root, run:

```sh
pnpm --filter api exec web-push generate-vapid-keys
```

Set the command's public/private values in the API's secret environment, together with a contact subject:

```dotenv
WEB_PUSH_VAPID_SUBJECT=mailto:admin@example.com
WEB_PUSH_VAPID_PUBLIC_KEY=<generated-public-key>
WEB_PUSH_VAPID_PRIVATE_KEY=<generated-private-key>
```

All three must be configured together. Keep the private key only in the API environment/secret manager; the web app receives only the public key. Restart the API, sign in to Nexeloq, allow notifications in the browser and subscribe to push, then enable PWA Push in notification settings for the desired events. The PWA service worker receives the push and displays it. Localhost is treated as a secure context by modern browsers; deployed sites need HTTPS. On iPhone/iPad, web push requires iOS/iPadOS 16.4 or later and the web app added to the Home Screen.

Never reuse a local development key pair against production notification subscriptions. If the local API shares the production database, keep VAPID disabled locally until it has an isolated database and subscriptions.

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

### Media preferences and image sources

Search and Hybrid modes try Openverse, with Wikimedia Commons as a fallback for empty or unavailable catalog results. Catalog results are restricted to public-domain or CC0 media. A selected preference supplies a general concept, a dedicated keyword and selection brief for search, a dedicated composition brief for generation, and up to eight references according to its Search, Generation or Both setting. In Hybrid mode, a Generation-only preference goes directly to generation. Available reference attachments are reused for a batch. If every configured attachment fails, the applicable media path reports a reference error.

When references are available for search, up to three viable images enter one metered visual review. The review can select a matching image or reject the shortlist. Search can try a second query taken from an example in the search brief. Hybrid mode falls back to reference-guided generation when a preference allows generation and search finds no match. A Search-only preference leaves media empty when no usable asset is found. For references with a generation brief, the visual review can select a single reference for the edit request and describe the framing, light and texture even when the shortlist is empty. The channel's existing URL and SHA-256 checks remain in use. New AI Posting images also store a visual fingerprint in run history to recognize resized or re-encoded copies.

An image search uses up to two keyword queries, two catalogs per query, and six candidate downloads when visual references or a search brief are present. Only one shortlist review and one generation can run per publication attempt, through the existing AI budget and usage ledger. This path adds no polling, timers or background database writes.

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

### История чата AI Posting

Сообщения чата сохраняются для рабочего пространства и канала. При открытии загружаются последние 100 сообщений; модели передаются последние 19 и новое сообщение. Сообщение и ответ сохраняются вместе после успешного ответа, до удаления канала или рабочего пространства. Чат принимает изображение или голосовое сообщение: сохраняются описание или расшифровка, а не исходный файл. Временная запись вложения доступна только тому же пользователю, каналу и рабочему пространству в течение 24 часов; просроченные записи очищаются порциями при последующих загрузках в этой области.

По явному запросу с названием компании чат ищет её через Wikidata, проверяет официальный HTTPS-сайт и доступную на нём страницу новостей, затем создаёт или повторно использует рубрику и подключает найденные источники. Поиск не охватывает независимые СМИ и не проверяет права на изображения. Выбранную публикацию можно сгенерировать и изменить по текстовым или голосовым правкам; описание прикреплённого изображения передаётся как контекст. Операции внешнего поиска, анализа и генерации запускаются только по запросу пользователя, учитываются существующим AI-учётом и ограничены размерами и числом запросов. При простое дополнительных таймеров, опроса, записей и нагрузки на Neon/Railway нет. Для 100 каналов нагрузка растёт по числу одновременно активных запросов, а не по числу подключённых каналов; существующие ограничения источников и размеров ответов сохраняются.

The media preference editor keeps the shared concept visible and has separate
Generation and Search controls for their respective briefs. A successful
batch upload sends one metered vision request with the current reference set
(up to eight images) and updates both briefs in the open editor. Saving commits
the references and edited briefs through the existing settings flow. Opening
the editor makes no AI request. If an attachment is unavailable or the AI
response is incomplete, the editor keeps the reference list and previous
briefs and offers an explicit retry.

Test run history keeps the requested position of each result. A draft with
failed media keeps its text preview and shows the media failure in that
position. A position rejected during editorial review shows the recorded
reason and the explicit new-run retry action. Positions from older batches
are reconstructed from the stored draft order and unmatched failures.

Batch drafting requests a provider-validated response with separate text and
media fields. The existing editorial review still runs on the authored text.
Generation streams send a keepalive every 15 seconds until the request ends.
If the connection closes while work is in progress, history can be refreshed
without starting another batch. The live preview keeps the original position
of each result when a slot between two drafts is still empty or has failed.

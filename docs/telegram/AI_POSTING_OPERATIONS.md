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

The OpenAI key is consumed only by the existing AI Gateway. It is used for both text and image requests; there is no separate image-provider key in this integration. Workspace and category enablement, provider/model selection, and workspace/category budget limits are configured in Operations > AI. AI Posting additionally accepts per-channel daily and monthly USD budgets; blank values leave the channel-specific cap unset while existing workspace/category caps continue to apply. An administrator can explicitly enable “AI Posting без денежных лимитов” in Operations > AI for a workspace. This removes workspace and category monetary admission caps for AI Posting only. Manual test runs can also bypass the channel cap. Autopilot also enforces the channel budget when one was configured. Usage and reservations remain recorded, and provider, concurrency, authorization, and automatic enablement checks still apply. Disabling the option restores the saved limits. AI Posting consumption continues to count in workspace spending totals.

Image behavior is selected per channel in AI Posting settings. Hybrid starts 80% of slots with search by default. Search tests multiple English descriptions and checks relevance, resolution and visible watermarks, as well as duplicates against nearby runs and the current batch. When a configured source has no match, search can use the open catalog. If no candidate passes, image generation provides a topic-specific illustration. Images that repeat or fail local quality checks get one alternative generation attempt, subject to shared provider admission. Failed slots stay incomplete in the test history and cannot be approved, saved or sent.

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

Open AI Posting → Autopilot and review the assigned publication plan. Activation requires saved audience and editorial settings and active CONTENT slots. Autopilot schedules ready drafts even if automatic AI generation is disabled in Operations → AI. The AI gateway applies existing workspace, category and configured channel limits when automatic generation is available.

The reserve is approximately 50 days at the midpoint of the assigned plan minimum and maximum, capped at 150 ready drafts. Required slots are used daily, and optional slots every second local day. Complete editor drafts with text and images are eligible alongside approved AI drafts. Autopilot fills empty CONTENT slots when the next 10 days contain a gap, with a persistent refill horizon of up to 20 days ahead. The canonical slot reservation and publication path keeps existing ads, mutual promotions and occupied slots intact. Each channel refill attempts its calculated stock deficit in sequential batches of up to 10 within one lease and emits one report. A batch with no ready posts or a budget rejection stops further generation. The stock target is capped at 150 and a run attempts at most 40 slot assignments. While replenishing, another run can start after two hours. Fully stocked channels are checked daily and failed work backs off. Stop prevents new work once the active operation returns. Drafts and accepted schedules stay in place.

The worker weights underrepresented editorial categories using up to 300 recent reviewed drafts and published/scheduled posts. It uses normalized engagement from comparable organic posts when a rubric has enough observations. Performance can move a rubric up or down one place in the usage counts. Unsubscribes are not attributed to individual posts. The group report identifies the channel, created and scheduled counts, latest filled slot, covered days, rubrics, spheres and the confirmed cost by stage. Search cost covers paid search calls, model tokens and the visual review based on the existing AI ledger. The report marks operations with unknown pricing separately. A workspace can enable multiple channels, each with its own report.

The existing due scheduler stays idle when there is no enabled work or pending notification delivery. For 100 active channels, each due occurrence handles one channel, reads bounded slot and editorial data, and uses the global AI and publishing admission paths. Report receipts are retained for 90 days. No browser polling or new timer is required.

Analytics use the detailed `AiOperation` ledger, filtered by workspace, channel, date, mode, and AI category. The selectable range is limited to 90 days, matching the detailed-operation retention policy. Planning cost is allocated across the preview publications for per-post display while the underlying planning operation is counted once in aggregate ledger spend. Failed and retried operations remain part of spend when the provider reports a charge.

### Media preferences and image sources

Search sources are stored per channel in Media and in the import/export `imageSearchSources` field. They are tried in the saved order. Pinterest and other configured websites use the existing OpenAI API through Responses image search, restricted to that site's domain. Pinterest gets up to two distinct English queries. Wikimedia Commons uses its native catalog and license filtering. After the configured list is exhausted, one broader OpenAI search and the open catalog are available before generation. Openverse and native Wikimedia catalog results are limited to public-domain or CC0 media. A selected preference supplies a general concept, a dedicated keyword and selection brief for search, a dedicated composition brief for generation, and up to eight references according to its Search, Generation or Both setting. In Hybrid mode, a Generation-only preference goes directly to generation. Available reference attachments are reused for a batch. If every configured attachment fails, the applicable media path reports a reference error.

When references are available for search, up to three viable images enter one metered visual review. The review can select a matching image or reject the shortlist. Search-first mode can request a generated image after exhausting the search. Hybrid search slots keep the search-first order on retries and fall back to generation. A preference marked Search supplies guidance and references to searching only. A Search preference linked to a sphere or subsphere starts with real images. If search fails, the fallback is a topic illustration that must not imitate documentary evidence. When possible, Hybrid swaps that slot with another search slot to preserve its planned mix. For other search preferences with fallback enabled, generation uses the post topic without the search references. For references with a generation brief, the visual review can select a single reference for the edit request and describe the framing, light and texture even when the shortlist is empty. The channel's existing URL and SHA-256 checks remain in use. New AI Posting images also store a visual fingerprint in run history to recognize resized or re-encoded copies.

Planning uses the configured assignments and recent usage. The generator reads up to eight recent runs in one channel-scoped query to favor underused subspheres and rubrics. Lengths rotate across batches, and an ultra-short quote can select its matching rubric and subsphere.

After topic planning, one test run can contain up to ten publications. All publication pipelines can start text work after planning. Up to five media pipelines run concurrently, so a slow search does not delay text for other slots. Each completed preview is saved immediately and final results retain topic order. A two-choice draft returns the labels separately, and the server formats the reaction lines. Media links in model-authored copy are removed before caption validation. The progress bar counts settled publications, and the stage list tracks each publication independently. The batch shares reference downloads and image history, and reserves image identities to prevent reuse. AI gateway admission and provider timeouts remain in effect. The batch waits for a sibling that passed admission before retrying a capacity rejection. When progress is read, a background run with four minutes of inactivity is reported as interrupted. Starting a new run clears its active status. No recurring work is added for idle channels.

Each website search uses one metered OpenAI tool call and a bounded list of up to six candidates. Native catalog lookups and the existing visual review use the same candidate limits. Search calls and model tokens use the existing gateway admission, budgets, and ledger. Each shortlist is evaluated before continuing to the next source. Media search checkpoints reuse existing run progress. No background polling or timer is added for idle channels.

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
Manual batch generation returns HTTP 202 with a saved run ID before collecting
sources. The API process continues that run independently of the browser.
Reopening the console restores the saved stage and notification. A visible
console checks one active run every five seconds and refreshes history when
new previews are saved or the batch settles. Each preview keeps its original
position. Repeated starts for the same channel return its active test run. The card and notification count settled publication slots. While sources are collected, the bar stays empty; the stage checklist shows finer progress.

Stop marks a manual background run as canceled. Clear also stops manual
background runs and removes test history after confirmation. Both prevent
later stages from starting. An already submitted provider request can still
finish and be billed. If the API process exits, an abandoned run can be stopped
or cleared. After four minutes without a saved checkpoint, it is shown as
interrupted. The API does not replay paid operations from a dead process.

The resume read checks workspace membership and one run by ID and sends back
only status and progress. A hidden, unmounted or idle console makes no interval
reads. One visible detached run uses up to 12 checks per minute, or up to 1,200
if 100 channels are actively watched in separate visible consoles. Checkpoints
reuse receipt writes and add two writes per publication for media start and
preview completion. Cancellation checks read one run before each paid media
request or search round. Checkpoints use existing run JSON and history
retention, with no per-channel worker, recurring timer, or idle database reads.

### Search rounds and publication expenses

An image assigned to search tries up to five rounds using WordPress Photo
Directory, Openverse and Wikimedia Commons. Later rounds use shorter English
phrases, different catalogs and later result pages. Only fresh, reusable results
are downloaded, and each round sends at most three candidates to visual
review. Empty rounds do not incur a model call. A search miss can trigger one
image generation request under the existing AI budget. If media still fails,
the preview keeps the text for editing and a media-only retry. Approval,
draft saving, and System Bot export require a ready image. Autopilot skips
failed media slots and continues with the ready publications.

The test-run publication stores the last nine search-round summaries and
actual usage operations in its existing JSON. The cost panel groups stage
totals, text attempts, editorial decisions and media operations, and displays
token counts and confirmed cost where recorded. Planning shows both its
full batch request and the allocated share in the individual publication.

There is no additional polling, cross-workspace query or storage table.
Per search publication the upper bound is 12 catalog lookups (at most
18 HTTP catalog requests including fallbacks), 30 bounded image downloads,
five shortlist reviews, one optional reference review and one image
generation request. Work starts only for an active
publication. At one simultaneous search per 100 active channels these
bounds scale to 1,800 catalog requests, 3,000 image downloads, 600
visual reviews and 100 fallback image requests. Early matches stop further rounds. Idle Neon activity and
Railway process count are unchanged.


Draft prompts pass a compact snapshot of the assigned editorial requirements,
nearby topics, and relevant source excerpts. Each publication starts at most
two text-model requests, including a caption-shortening call if needed. The
editor returns a structured verdict. A malformed verdict can be checked once
more on the same draft without spending on another text generation. All
requests use existing category settings and are included in the existing
usage ledger. At one publication per 100 active channels the upper bound is
200 text requests and 300 editorial checks, with no work while idle.

The active console tracks the run ID returned on acceptance and refreshes
history as previews appear or the run completes. History and progress reads
bypass the HTTP response cache. Expanding image search adds bounded work only
to active search slots, with no changes to idle reads, retention, or workers.

### Detailed channel analysis

From a channel's AI Posting settings, open **Детальный анализ канала** and
start the analysis. The operation reads the full synced organic history for
coverage and aggregate statistics, including the length distribution and median
normalized performance by length band. It supplies the model with a bounded
chronological sample, recent posts, and strong and weak examples with
normalized 24-hour performance. Advertisements, mutual promotions and
posts excluded from analytics are excluded. The visual step uses up to eight
available images. The report lists actual high and low examples from the database alongside
the qualitative interpretation and visual observations.

Review the report and download the JSON if needed. **Подставить в настройки**
loads the proposal into the existing editor. Review the channel idea,
editorial voice, media direction and sphere weights, then save explicitly.
Existing taxonomy identities, sources, configured endings, and publication
controls are reused. A settings version check rejects a stale save. Use the
test console to generate ten previews, then verify the range of subjects,
voice, sources and the relation between each image and caption. Test previews
remain pending until reviewed.

Sphere weights are relative integers from 0 through 100. A positive weight
activates proportional planning for the channel, an unspecified root counts
as 1, and an explicit zero skips that root. Channels without positive
weights retain the existing primary/secondary rotation. Analysis estimates
weights from the classified chronological sample. The editor can adjust
them without changing taxonomy IDs.

The action is manual and scoped to one workspace and channel. Two bounded
evidence queries return full-history aggregates and at most 79 short samples.
The operation downloads up to eight images and makes two text AI requests
plus one visual request when reference images exist and one additional text
request when existing taxonomy has gaps. It reuses AI Gateway
admission and receipts. Analysis itself adds no setting writes, recurring
jobs, polling, or report retention. With 100 saved channels idle, it adds
zero database or provider work. Running it individually on all 100 means up
to 400 metered AI operations and up to 800 image reads. Database work per
request scales with that single channel's synced history, with no per-post
network or database access loops.

### Visual variety

The **Чередовать формы изображений** setting rotates five forms across the
publication sequence: still life, editorial illustration, landscape, visual
metaphor and documentary photography. A ten-slot batch assigns two of each.
The setting controls composition independently of Hybrid search percentages.
When enabled, assigned forms take precedence over sphere-level image briefs.
Quote attribution does not require a portrait. Use the channel's rubric to
describe preferred authors and verification requirements.

The channel analysis includes up to four examples from editorial drafts and
scheduled posts in its existing eight-image limit. The generation pipeline
checks found images and generated images against the assigned form, relevance
and natural finish. Generated images receive at most one existing bounded
quality retry. A retry without a new brief keeps the original form; a manual
revision can specify its own scene.

This adds two bounded channel-scoped reads during manual channel analysis and
up to two metered visual checks per slot that reaches image generation. A
ten-slot run therefore adds at most 20 visual checks. One such batch across
100 opted-in channels adds at most 2,000 checks, subject to existing admission
and budgets. Idle workloads, storage retention and publication scheduling
use their existing paths.

### Telegram message preview

Open **Settings → Notifications → Предпросмотр сообщений** and choose a
channel. The preview shows the coverage notification and both autopilot
outcomes using the delivery formatter and the channel's saved custom emoji.
It uses sample metrics and never sends a message.

The Telegram group receives one compact summary per autopilot run, with
totals for drafts, scheduling and coverage. If items failed, the summary
includes a warning and the error count. Detailed alerts remain in the app
and run history. The coverage switch applies to all active channels,
including newly added channels, except those explicitly excluded. Workspaces
that used active reminder assignments are subscribed by the migration.

### Greeting-card channels

The two Ukrainian greeting-card channels use separate art directions and
one bundled Lora typeface. The image model produces original full-bleed art.
Visual review uses structured fields to check the subject, detail, composition,
text-free artwork and room for the greeting. The reference review passes
palette, lighting and texture guidance to generation as text. The server typesets the exact Ukrainian wish over a
locally shaded area before applying the optional avatar watermark. Original
image generation is the recommended media setting for these channels.

A definitive quality failure allows one new image, with a simpler composition.
An unreadable or failed review can be repeated once on the same image while
the gateway permits it. Budget, disabled-provider and uncertain-settlement
states still stop the media path. A failed image slot can be repaired from
the test run while its reviewed draft text stays available.

The work runs inside the existing per-publication pipeline. It adds no idle
polling, retention or database writes for unchanged state. For 100 channels,
requests scale only with active image slots. In original-generation mode each
slot uses up to one reference review, two image calls and four image reviews
in the worst case. Typical successful slots use one image and one review, with
an optional reference review. Portrait outputs carry more image bytes than
square outputs. The bundled font is local, and the existing media semaphore
bounds Railway image-processing concurrency.

The `Святкові листівки` rubric uses a local calendar rather than a model's
guessed dates. In a manual batch of three or more, the planner can add one
upcoming occasion with its local date. Confirm the date when scheduling the
draft. A holiday suggestion does not create a calendar slot or change a
publication already scheduled.

# AI Posting configuration redesign

Status: implementation in progress  
Owner: Telegram AI Posting API and Web  
Updated: 2026-11-14

## Product decisions

- Retire the legacy Sources, Formats, Profile history, Effectiveness and Autopilot
  tabs and remove their API functionality. Preserve the calendar post-planner
  format system; it is a separate workflow.
- Delete legacy AI Posting source/format/profile-version/autopilot data through a
  scoped migration. Preserve generated posts, test runs, and AI expense ledger
  rows because they remain operational and financial history.
- Weight primary and secondary spheres equally by default; shuffle within each
  tier to avoid consecutive repeats when alternatives exist.
- Length buckets use non-overlapping character bounds: ultra-short 0–99,
  short 100–299, medium 300–699, long 700+. Channels receive these defaults and
  can add custom lengths. Rubrics can target one, several, or all active lengths.
- Sphere sources are optional. When configured, research starts with those
  sources and may broaden to web research when their evidence does not support a
  useful idea. With no sources, research starts with web search.

## End-to-end contract

1. A channel's Idea tab edits channel audience, value proposition and language,
   then manages primary/secondary spheres and nested sub-spheres. Each sphere
   owns its description, optional source URLs and optional media preference.
2. How to write edits rubrics. A rubric has a title, resolved emoji, description,
   desired reader action, one sphere, optional sub-sphere and one or more
   allowed length IDs. It also holds the existing writing-wide controls:
   publication-history use, length variation, emoji policy, ending and hashtags.
3. Media preferences declare `SEARCH`, `GENERATION`, or `BOTH`; legacy records
   migrate to `BOTH`. The image-mode selector presents each mode with its own
   icon. Avatar compositing stays as a compact control.
4. Generation chooses a sphere and rubric with equal primary/secondary
   probability, then a permitted length, gathers evidence, drafts and reviews.
   The generated publication retains sphere/rubric/length display metadata.
   Missing sphere sources triggers web research; weak supplied evidence can also
   trigger a bounded web-search fallback. Each stage records its actual AI cost
   in the existing AI usage ledger: research, text, image and review remain
   separately attributable.
5. Channel settings export/import use a versioned JSON contract. Import validates
   all entities and references before a single transaction replaces the
   channel's AI Posting configuration. It never imports Telegram credentials,
   posts, messages, or AI ledger entries.
6. The channel chat uses left/right message identity, a visible reply quote,
   attachments/voice actions, and compact ChatGPT-like controls. Reply context is
   stored by message ID and is included in the bounded generation context.

## API shape

- `GET/PUT /telegram-channels/:channelId/ai-posting` remains the shared writing
  preference endpoint; remove legacy `sources`, `formats`, rules, profile
  snapshots and autopilot fields from its DTO and response.
- Add channel-scoped read/write operations for the channel idea, spheres,
  lengths, and rubrics. Every operation is workspace-scoped and verifies that
  related sphere/length/preference IDs belong to the same channel.
- Add `GET .../ai-posting/settings/export` and `POST
  .../ai-posting/settings/import` with `schemaVersion`, full validation and
  atomic replacement semantics.
- Chat post accepts optional `replyToMessageId`; the server verifies it belongs
  to the same workspace and channel before using its text as reply context.
- Generation result and persisted managed-post metadata include sphere, rubric
  and length identities and presentation labels.

## Data and migration

- New channel idea, sphere, rubric and custom length rows are workspace/channel
  scoped. Child spheres reference their parent in the same channel; rubrics
  reference a sphere/sub-sphere and active length IDs.
- Built-in lengths are inserted once for every existing AI Posting channel by
  the migration and created alongside future AI Posting settings. Do not seed by
  writing on every settings read.
- Migration removes only legacy AI Posting source/format configuration data,
  settings-version history, autopilot run/stage and autopilot notification
  records/columns. It preserves planner formats, generated publications, test
  runs, chat messages, and AI cost facts.
- `TelegramAiPostingGeneration` and `AiUsageDaily` are extended with the research
  stage cost attribution without adding polling, recurring jobs, or per-channel
  runtime work.

## Verification

- API: workspace isolation, cross-channel references, invalid import rollback,
  rubric length constraints, deterministic built-in lengths, no-source research,
  weak-source fallback, prompt/output metadata, per-stage AI cost, and reply
  ownership failures.
- Web: tab removal/addition, preference purpose badges, mode icons, compact
  avatar row, CRUD empty/loading/error states, import/export validation, chat
  reply/composer flows, and generated-post metadata.
- Run Prisma validation/generation, targeted API/Web tests, API/Web typechecks,
  builds and architecture checks. Manually review at 320/360/390/768/1440px.
- No background poll is added. Research runs only as part of explicit
  generation; batch sphere/rubric/length reads per channel and never fetch a
  per-sphere resource list in a loop.

## Progress

- [x] Read current architecture, graph navigation and UI/runtime contracts.
- [x] Confirmed calendar planner formats are separate and must remain.
- [x] Sort network cards by descending subscriber total.
- [x] Replace the old AI Posting settings navigation with Idea, How to write,
  Media and Chat; remove the autopilot run-history panel from the page.
- [x] Add editable sphere/sub-sphere, rubric, custom-length and media-purpose
  controls to the channel settings UI.
- [x] Pass sphere/rubric/length metadata through manual generation and show the
  selected metadata on generated publications. Sphere tiers alternate evenly
  across manual test runs using the channel's existing run history as offset.
- [x] Apply media preference purpose to image generation and search prompts.
- [x] Add scoped channel idea/sphere/rubric/length schema, transactional API
  persistence, settings JSON import/export, built-in length backfill and a
  separate generation research-cost field.
- [ ] Finish the destructive cleanup migration for retired source/version/
  autopilot data and legacy schema fields.
- [ ] Update source research, generation metadata and stage costs.
- [x] Add the Idea, How to write, Media and Chat navigation and editors, remove
  obsolete tab components, and add per-message chat reply targeting.
- [x] Remove autopilot scheduling from the active task registry and remove
  autopilot run history/settings from the page.
- [ ] Remove all obsolete API/schema/notification paths and dead backend code.
- [ ] Implement web research with actual source evidence and separate per-stage
  cost attribution; the current migration only reserves the research-cost field.
- [ ] Add regression coverage and manually review responsive/UI flows. API build,
  web typecheck and Prisma validation/generation currently pass.

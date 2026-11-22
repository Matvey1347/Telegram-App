# Channel avatar emoji through Nexeloq System Bot

Avatar emoji uses the existing `TelegramSystemBotConfigService`. No separate
Emoji Bot, webhook, commands, bot runtime or credentials are required. This
integration never modifies the System Bot webhook or commands, and does not
access the Finance product or its bots.

## Configuration

- `TELEGRAM_SYSTEM_BOT_ENVIRONMENT=LOCAL` selects
  `TELEGRAM_SYSTEM_BOT_LOCAL_TOKEN` / `TELEGRAM_SYSTEM_BOT_LOCAL_USERNAME`.
- `TELEGRAM_SYSTEM_BOT_ENVIRONMENT=PRODUCTION` selects
  `TELEGRAM_SYSTEM_BOT_PRODUCTION_TOKEN` / `TELEGRAM_SYSTEM_BOT_PRODUCTION_USERNAME`.
- `TELEGRAM_AVATAR_EMOJI_OWNER_USER_ID` is the numeric Telegram user ID of the
  owner of system-created packs. That user must send `/start` to the selected
  System Bot. No additional bot needs to be created.

Missing/invalid environment disables generation; there is no token fallback.
Equal LOCAL/PRODUCTION tokens are rejected. Before any Telegram mutation the
adapter verifies the selected token's username through `getMe`. Credentials
are never included in reports or propagated from transport errors.

The old dedicated-bot configuration has been removed. The root `.env.example`
and `pnpm env:check` use the canonical owner variable above. Keep deployment
secrets in the existing protected environment, never in command arguments.

## Channel eligibility and normal flow

A workspace-scoped `TelegramChannelSourceAccess` with `sourceType=MTPROTO`
and role `OWNER` or `ADMIN` qualifies. The same check applies before enqueue,
claim, download and final binding. Use a connected administrator for a fresh
photo. When that account is unavailable, an inline image saved for the channel
can supply the avatar without another Telegram session.

The shared image pipeline center-crops actual Telegram bytes to 100×100 and
masks transparent round corners. Hashes prevent duplicate generation. Missing
photos use normal fallback. Selected icons continue through `Icon`,
`presentationIconId` and `ResolvedEmoji`; no display-only per-row lookup is
added. Explicit refresh/restore controls remain in the existing IconPicker
settings. An untouched settings draft does not write a stale icon selection.

Manual icon selection survives generation, migration and refresh. Restore
atomically chooses the latest generated avatar with an OWNER check. AI Posting
uses explicit insertion into existing `ending`, preserving user text and
avoiding duplicate signatures. Existing publication schedules, placements and
stored publications are not rewritten.

## Packs, versions and migration

Set names remain deterministic and end in `_by_<selected_system_bot_username>`.
The publisher only mutates sets belonging to that selected bot and rolls over
at 200 emoji. One bounded global publisher lease/cooldown and channel claims
protect concurrent attempts. The target set and its document IDs are stored before mutation. Telegram turns
an uploaded PNG into a new WebP emoji document with a DIFFERENT file identity;
upload `file_unique_id` is not treated as the installed emoji identity. The
publisher reconciles new documents against the persisted pre-mutation set and
verifies their decoded image, allowing Telegram's observed lossy WebP conversion.
Exact source SHA-256 still determines avatar versions. Confirmed installed IDs
and file references are then stored. UNKNOWN outcomes are only reconciled,
never resent. The affected set accepts only reconciliation until the outcome
is confirmed. Other avatars can publish to a separate set and known cached
versions remain usable. Explicit rejections clear the unsent snapshot. When a later image arrives, an older pending asset is reconciled from its saved immutable bytes independently of channel ownership/deletion or avatar changes; no old send is repeated. A genuinely unresolved UNKNOWN after bounded retries needs operator reconciliation.

Each new asset key is `environment:system_bot_username:image_hash`. Generated
Icon names refer to that immutable key. Thus a cached document from a dedicated
bot, or from the opposite environment, cannot become the new bot's result.
Existing old asset rows, documents, packs and Icons remain untouched so earlier
messages and saved endings still resolve. User-imported emoji packs stay in
their separate tables; system document resolution never imports system sets.

The migration reuses stored immutable avatar PNGs through the existing
processor and publisher. It does not open MTProto sessions. It creates a new
version, updates the generated channel binding and updates the selected icon
only in automatic mode. Repeated runs skip current versions. There is no pack
or emoji deletion, including after a successful migration.

## One-shot commands

Commands default to dry-run and require an exact workspace ID:

```bash
pnpm avatar-emoji --workspace=WORKSPACE_ID --dry-run
pnpm avatar-emoji --production --workspace=WORKSPACE_ID --dry-run
pnpm avatar-emoji --workspace=WORKSPACE_ID --mode=backfill --dry-run
```

`migrate` is the default mode and only plans existing generated bindings.
`backfill` plans initial generation for managed channels. `stored` uses only
saved inline photos and never opens an MTProto session. Dry-run reports
stored photo presence, not a fresh Telegram photo check. It works before the
avatar schema is deployed and reports that prerequisite explicitly.

After reviewing/approving the production plan, use the existing Railway
pre-deploy migration process. Execution additionally requires the selected
System Bot environment to match the target:

```bash
pnpm avatar-emoji --workspace=WORKSPACE_ID --mode=migrate --execute
pnpm avatar-emoji --production --workspace=WORKSPACE_ID --mode=migrate --execute
pnpm avatar-emoji --production --workspace=WORKSPACE_ID --mode=stored --execute
```

Fresh production `backfill --execute` is allowed only on the production host:
never reuse production MTProto sessions locally while Railway owns them.
Neither command starts AppModule, an API host, a worker, cron or publication
services. Migration uses only bounded DB operations and the selected Bot API.

Use `--limit=100` (maximum 1000) to bound one run. If `pagination.truncated` is
true, resume with `--after=<pagination.nextCursor>` using the same workspace.
Reports contain one row per considered channel, ownership, manual mode, action,
confirmed document ID, authoritative DB verification and creation/reuse counts.
Failures produce a nonzero exit status. A failed one-shot attempt does not
schedule hidden retries; normal runtime retry behavior remains unchanged.

## Real LOCAL Telegram check

```bash
pnpm avatar-emoji --workspace=WORKSPACE_ID --mode=smoke --dry-run
pnpm avatar-emoji --workspace=WORKSPACE_ID --mode=smoke --execute
```

Smoke uses avatars of two workspace-owned channels, the LOCAL System Bot and
only the configured owner's private chat. It checks upload, pack creation/add,
repeat reconciliation, `getCustomEmojiStickers`, downloaded 100×100 pixels,
transparent corners and returned `custom_emoji` message entities. It snapshots
webhook/commands before and after using read-only methods. It verifies generated bindings and repeated-image reuse in the LOCAL database, preserving manual selection. It never modifies production channel records. All verification booleans must pass; Telegram accepting
ordinary ALT text alone is not a successful custom-emoji check. Actual client
appearance must also be inspected in the sent messages/pack.

Respect any Telegram `retry_after`; do not repeat create calls during that
cooldown. Creation of a set does not itself establish message-sender eligibility.

## Cost and retention

Existing due-driven runtime keeps one nearest-deadline timer. With no due work
there is no idle polling, unchanged-state write or per-channel process. The
one-shot utility exits and disconnects its pool; it leaves no timer/server.
At 100 owner channels with distinct new avatars, normal backfill has at most
100 photo operations, 100 uploads and 100 create/add calls plus bounded pack reads, at most one document file lookup/download per normal new version, and binding transactions. Migration avoids photo/MTProto calls entirely.
Nonowners and current versions produce no uploads. A dry-run is one bounded
workspace inventory plus schema/pack reads, with no writes or Telegram calls.
PNG versions are immutable and small (100×100); old versions are retained for
historical messages. Idle Railway CPU/RAM/network and Neon wakeups do not grow
with stored channel count; useful work consumes resources only when admitted.

## Manual QA

1. Confirm OWNER-only eligibility; admin-only/external channels must not upload.
2. Run LOCAL smoke, inspect the two private messages and pack in Telegram.
3. Refresh an unchanged avatar: same document; change the actual test avatar and
   refresh: a new version, with old messages still rendering.
4. Select a manual icon, migrate/refresh, verify it survives; Restore must use
   the newest generated binding. Saving unrelated settings must preserve it.
5. Repeat migration and concurrent refresh; verify no duplicate documents.
6. Verify a 200-item set rolls over and old sets remain intact.
7. Inspect IconPicker and channel lists/confirmations, plus AI Posting ending.
8. Apply production changes only after its dry-run and explicit confirmation.


## Verification — 2026-11-18

- LOCAL `@nexeloq_dev_bot` and PRODUCTION `@nexeloq_bot` identities were checked
  with getMe; configured usernames matched and tokens were distinct.
- No old system pack/asset tables existed in production; expected dedicated-bot
  set names 1–3 were absent in Telegram. Production dry-run found zero legacy
  bindings to move. It found Business `cmptsyujx0001flritxdrq84b`: 36 channels,
  nine with OWNER evidence (eight stored photos / one without). The other 27
  are excluded. No production schema/config/channel write was performed.
- Both tracked avatar migrations were applied/registered in LOCAL only.
- Real LOCAL smoke confirmed document IDs `6048626443234059650` and
  `6050974914171641668`, availability, 100×100 transparent corners, actual
  custom_emoji entities, local DB binding and unchanged-image reuse. The owner
  visually confirmed round avatars in Telegram messages 637 and 638.
  Webhook and commands matched before/after.
- Initial smoke runs exposed the real upload/document identity mismatch and
  created redundant LOCAL test copies (20 LOCAL sets / 61 total documents after the successful check). They were retained, not deleted; the
  full pack inventory is in `.codex/tmp/channel-avatar-emoji/`. Production and
  user-imported packs were untouched. The fixed smoke uses the shared processor
  and publisher; it no longer has an independent pack-mutation implementation.
- A live change of a real channel's Telegram photo and a live settings-page
  click-through were not performed. Changed-photo/manual-mode/restore and UI
  behavior are covered by automated regressions; no production photo was edited.


Final validation: 134 focused API regressions passed, including owner admission,
remote reconciliation, environment isolation, module wiring, image processing,
smoke and publication deadlines. API/web/shared typechecks and builds passed;
new/core avatar files pass ESLint and `pnpm env:check` passes. The full API suite
still reproduces the 31 existing failures in 14 suites; repository-wide
architecture checks remain blocked by existing unrelated violations. No server
or watcher started for verification remains running.

## Production activation · 2026-11-22

The PRODUCTION System Bot created 11 avatar documents for the Business
workspace in [channelavatars1_by_nexeloq_bot](https://t.me/addemoji/channelavatars1_by_nexeloq_bot).
The one-shot stored-photo run opened no MTProto sessions. Verification read
all 11 documents from the Telegram set and confirmed that all 11 production
channels select their generated icons. Test 2 had no saved photo. The
remaining catalog rows had no same-workspace MTProto administrator evidence.

The DevBot sets were consolidated separately. The retained development set
has eight confirmed channel-avatar bindings. Telegram acknowledged the
deletions and stopped offering the retired public sets for installation.

Railway production deployment `d1bd107e-6b2b-4760-9913-e0d0af653edf`
is active and returned HTTP 200 on `/api/health`. The post-deploy database
read confirmed 11 active bindings to the production set. The release
contains the avatar changes only and reuses the existing database schema.

# Production readiness acceptance

Проверка 20 ноября 2026. **Вердикт NO-GO для передачи текущего кандидата в эксплуатацию.** Публичные production endpoints доступны. Полный пользовательский сценарий на согласованном канале не подтверждён. Гейт deployment воспроизводимо падает. Отдельно обнаружен красный тест VP после изменения обработки исторического pending.

## Версия локальная / версия развернутая

| Среда | Версия и доказательство |
| --- | --- |
| Локальный кандидат | `8363f61db2b96484b2561162f5ff4f715931cb1d` и незакоммиченные изменения Prompt 1–3. Воспроизводить из того же рабочего дерева. HEAD сам по себе не содержит проверенный кандидат. Node 24.18.0, pnpm 9.0.0. |
| Railway Nexeloq API, production | Read-only Railway `list-deployments` вернул deployment `a6d5b019-7aae-488d-94af-9ad62c7cc557`, SUCCESS, 2026-11-19 22:59:11 UTC. GET `https://api.nexeloq.com/api/health` вернул 200 и Railway edge header. |
| Vercel production | Read-only Vercel `get-deployment` по домену `nexeloq.com` вернул deployment `dpl_7HZbkrNdamQ1tcUffsPqkNHykBd3`, READY, target production. Apex вернул 308, `www.nexeloq.com` — 200. |
| Сопоставление ревизий | Оба ID совпадают с исторической записью выпуска `b7f481b1`. В текущих ответах deployment lookup Git SHA не получен. Публичный health не идентифицирует ревизию. Развёртывание текущего рабочего дерева не подтверждено. [Историческая запись](../telegram/CHANNEL_RESCHEDULING.md#two-channel-live-acceptance-2026-11-1920). |

Проанализированы runbooks [production Codex](../production-codex-workflow.md), [локальных и production-профилей](../setup/LOCAL_PRODUCTION_WORKFLOWS.md), [owner transfer](telegram-owner-transfer/DIAGNOSIS.md), [publication reliability](../telegram/PUBLICATION_RELIABILITY.md) и [channel rescheduling](../telegram/CHANNEL_RESCHEDULING.md). Предыдущие live-записи отделены от результатов этого прогона.

## Матрица приёмки

PASS относится к наблюдению в указанной среде. BLOCKED означает, что необходимое действие или доказательство отсутствует. FAIL означает воспроизводимый отказ или несоблюдение контракта в проверенной ветке.

| Scenario | Command/request | Expected | Observed | Evidence | PASS/FAIL/BLOCKED |
| --- | --- | --- | --- | --- | --- |
| Local rejects remote DB before migration | `DATABASE_URL=postgresql://fixture@production.example.invalid:5432/fixture pnpm dev:local` | Немедленный отказ, без Prisma/Nest/Next/tunnel | Exit 1, разрешён только Docker localhost:5433. Тест со spawn sentinel подтвердил отсутствие дочернего запуска | `scripts/dev-production.test.mjs`, `scripts/dev-products.mjs`, `scripts/dev-local-database.mjs` | PASS |
| Local Docker, Next → API → draft → DB | `docker compose port postgres 5432`, `pnpm dev:local` с loopback URL | Проверка локального Compose, миграция своей БД, создание/чтение локального черновика | Docker binding подтверждён. Собственный launcher остановился до миграции на занятом 4000. Уже запущенный Next на 3000 вернул 500 на проксированном health. Чужие процессы оставлены. Draft через этот запуск не проверен | Порты по `lsof -nP -iTCP:3000 -iTCP:4000 -sTCP:LISTEN`, отдельная Docker-БД ниже | BLOCKED |
| Production UI starts only local Next and gateway | `pnpm dev:prod-ui --live`, GET `/login` на 3010 | Локальный Next, LIVE, loopback listeners, без запуска Nest | Next 16.2.6 Ready, HTML 200 с `/_next/` и `LIVE ACTIONS`. Сравнение listeners до/после показало только 3010 и 3011. Браузерный host недоступен | stdout launcher, HTML и `lsof`, ветка `mode === "operator"` в `scripts/dev-production.mjs` | PASS |
| Production UI GET actually reaches Railway | GET `/api/auth/me` напрямую и через 3010 с заведомо недействительным fixture bearer и одинаковым correlation ID | Railway отклоняет сессию, шлюз передаёт ответ | Оба ответа 401 с тем же `release-qa-readonly`. Запрещённый API path через шлюз дал 403 | Сравнение статусов и заголовков, без чтения данных аккаунта | PASS |
| Production UI authorized GET, POST, stream and UI refetch | Обычный вход и выбранный канал, approved publish/draft request | RBAC и изменения на deployed API, поток до завершения и актуальное UI | Нет выданного scope, авторизованной browser-сессии и разрешения на реальную мутацию. Mock проверил проксирование GET/POST, SSE/NDJSON, bearer, confirmation и tenant headers | `scripts/dev-production.test.mjs`, профильные UI тесты | BLOCKED |
| Operator missing private profile | `pnpm dev:prod-operator --live` | Fail closed до запуска детей | Exit 1. Listeners 3003/3004/4003 не появились. Доступный приватный профиль не найден | stdout и `lsof`, `scripts/dev-production-profile.mjs` | PASS |
| Operator scoped reads/writes, no workers, cloud-owned MTProto | Определённый workspace/owner/channel через gateway и request-only Nest | Локальный draft/recovery обслуживает production DB; только relay для MTProto; прочие мутации отклоняются | Gateway/Nest/relay fixtures проверили identity, capability, workspace, channel и точный batch. Остальной runtime отсутствует в составе модуля. Реальная роль БД, routing и cloud ownership в этой сессии не активированы. Immediate publish по политике идёт на deployed endpoint | `production-recovery.bootstrap.ts`, `production-recovery.module.spec.ts`, `production-recovery-admission.spec.ts`, `production-recovery-mtproto-relay.spec.ts` | BLOCKED |
| Recovery after lost ACK, concurrent sender | Five Prisma tests on disposable DB, gateway/relay fixtures | Одна внешняя попытка, claim/journal сохраняют unknown | Prisma с двумя независимыми соединениями подтвердил single claim, lost send/cancel, rate-limit continuation и one publisher. Gateway/relay fixtures подтвердили отказ повтора в текущем процессе | `telegram-managed-post-send-journal.postgres.integration.spec.ts`, `scripts/dev-production.test.mjs` | PASS |
| Owner transfer source/invite/ad counters | Focused API and web commands below | Capability, canonical peer, partial pagination, history retention, unknown vs zero, cache invalidation | Mock/TanStack tests прошли для охваченных веток. Реальные owner/admin, visibility/revoked/expired и счётчики из Telegram/БД не сопоставлены | `telegram-owner-transfer-diagnosis.spec.ts`, registration, invite-window, admission, query invalidation specs | PASS |
| Owner transfer live including bots and shared CRM | Read-only A/B одного согласованного канала | Сравнить raw counts, права, source и сохранённые значения с обеих сессий | Область и доступ не предоставлены. CRM и bot fixtures входят в локальные проверки. Свежий реальный цикл отсутствует | [A/B протокол](telegram-owner-transfer/DIAGNOSIS.md#read-only-ab-для-согласованного-канала) | BLOCKED |
| VP legacy pending baseline | `pnpm --filter api exec jest --runInBand mutual-promotion-command.service.spec.ts` | Unknown baseline остаётся неизвестным до отображения. Тест фиксирует этот контракт | Чистый HEAD 13/13, кандидат 12/13. Существующий тест ожидает запись `inviteRequestedAtStart: 0`, код её больше не делает. Отдельно в VP history mapper null подставляется как 0 при расчёте delta | `mutual-promotion-command.service.spec.ts:169`, `mutual-promotion-command.service.ts`, `mutual-promotion-attribution-history.service.ts:186` | FAIL |
| Scope of destructive actions | Operator allowlist, recovery filters и `pnpm --filter api exec jest --runInBand telegram-managed-post-scheduled-reset.service.spec.ts -t 'deletes every remote scheduled message'` | Ad/VP, чужие и неизвестные remote IDs защищены во всех применимых потоках | Operator блокирует DELETE, reset и неподходящий batch. Native recovery исключает ad/VP и batch. Для общего `resetChannelScheduledPosts` существующий тест требует передать в удаление все видимые remote IDs. Код не сверяет их с per-post ACK и не исключает ad/VP из передаваемых ID. Реальная очередь не изменялась | `scripts/dev-production-policy.mjs`, `telegram-managed-post-rescheduler-repair.ts`, `telegram-managed-post-scheduled-reset.service.ts:92`, `telegram-managed-post-scheduled-reset.service.spec.ts:1077` | FAIL |
| One agreed private publication | После отдельного разрешения выполнить одну публикацию с заранее записанным post ID | Telegram ID/URL/content/UTC, DB post/journal, повторный GET и отсутствие дублей | Разрешения, channel/post IDs и доступа для сверки нет. Send/delete не выполнялись | Протокол ниже | BLOCKED |
| Prisma generate and migration | Команды для одноразовой Docker-БД ниже | Prisma client создаётся, миграции и schema verify проходят | Prisma 7.8.0, 247 миграций, deploy и проверка схемы PASS | `pnpm db:generate`, `db:deploy:safe` на 127.0.0.1:55449 | PASS |
| Scripts and deployment contract | `pnpm test:deployment`; `node --test scripts/qa/crm-ai/*.test.mjs` | Все проверки пакета проходят | 58 Node deployment-тестов и 8 CRM QA тестов прошли. Wrapper deployment завершился exit 1, checker ожидает `railway.json build.buildCommand` хотя сборка перенесена в Dockerfile | `scripts/check-railway-build.mjs:8`, `railway.json`, `Dockerfile`, `.github/workflows/ci.yml` | FAIL |
| Architecture | `node scripts/check-architecture.mjs` | Без нарушений | Exit 1, прежние 24 нарушения, результат совпадает с baseline Prompt 4 байт в байт | [Baseline](../refactoring/REFACTOR_STATUS.md) | FAIL |
| Repository lint and full tests | Команды ниже | Чистый lint и полный прогон | API lint 8376 ошибок, 461 предупреждение; web lint 138 ошибок, 171 предупреждение. Full web 18/425 suites и 47/2104 tests failed. Full API см. итоги ниже | Отдельные focused проверки и классификация ниже | FAIL |

## Command set

Run from the repository root. The URL below points only to an ephemeral local
fixture. Do not substitute a deployment URL. On a clean run use an unused
container name and port.

```sh
docker run --rm -d --name nexeloq-p5-qa-db \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=release_qa \
  -p 127.0.0.1:55449:5432 postgres:18
docker exec nexeloq-p5-qa-db pg_isready -U postgres -d release_qa
DATABASE_URL=postgresql://postgres@127.0.0.1:55449/release_qa pnpm db:generate
DATABASE_URL=postgresql://postgres@127.0.0.1:55449/release_qa pnpm --filter api run db:deploy:safe
PUBLICATION_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55449/release_qa \
  pnpm --filter api exec jest --runInBand --silent \
  'telegram-owner-transfer|ad-campaign-invite-window|telegram-user-accounts.service|invite-links-sync|telegram-invite-link-registration|telegram-pending-join-requests|telegram-mtproto.client.spec|publication-deadline|due-work-predicates|telegram-managed-post-|managed-post-history|managed-post-publishing-source|mutual-promotion-(lifecycle|boundary|statistics|invite-link)|scheduled-tasks.service|telegram-ad-(sales.service.spec|placement-lifecycle)|telegram-mtproto-session.factory|telegram-crm-runtime-manager|telegram-channel-access|production-recovery|ad-campaign-admission-analytics|return-managed-post-to-draft|update-managed-post'
docker stop nexeloq-p5-qa-db
pnpm --filter web exec vitest run use-campaign-invite-link-refresh \
  campaign-invite-links-select campaign-invite-link-history-modal campaigns-table \
  production-confirmation telegram-query-invalidation
pnpm --filter api typecheck
pnpm --filter api build
pnpm --filter web typecheck
pnpm --filter web build
pnpm test:deployment
pnpm architecture:check
pnpm --filter api lint
pnpm --filter web lint
pnpm --filter api exec jest --runInBand --silent
pnpm --filter web exec vitest run
```

The focused API result is **573 passed across 64 suites**, with five real local
PostgreSQL fixtures. Focused web is **23 passed across six suites**. API and web
typecheck and build passed. The full API process emitted 15 failing suites
before terminating with SIGSEGV. It produced no final suite count. The temporary
PostgreSQL container and live UI launcher were stopped.

### Classifying red checks

- **Baseline reproduced.** Architecture returns the exact 24 errors recorded
  before the script move. No ceiling was changed. The Railway checker and its
  Dockerfile-based input are unchanged from HEAD. The checker fails before
  testing build outputs because it still expects an inline build command.
- **Current candidate failure.** A detached worktree at HEAD with the same
  installed dependencies passed all 13 tests in the VP command suite. The
  working-tree candidate passed 12 and failed one. The suite expects legacy pending
  to be initialized to zero. The candidate omits this write. Changing that test
  alone does not resolve the unknown pending conversion in the history mapper.
- **Other broad failures.** Full API halted on this host and full web/lint
  completed red. The component and suite paths include unrelated areas.
  Individual regressions outside the verified baseline and VP case are
  unclassified. The focused run does not replace the full gates.

## LIVE verified / not verified

**LIVE VERIFIED** for public Railway health, Vercel production alias and
deployment metadata, and the live gateway's forwarding of an unauthenticated
read. The local sign-in HTML contained the LIVE label and local Next assets.

**LIVE NOT VERIFIED** for the authenticated and hydrated UI, production operator
preflight with the dedicated role, workspace/channel data, real ownership
transfer, live streaming during a mutation, and an actual Telegram publication
or cancellation. No login, Telegram send/delete, deployment or production DDL
was performed. The historic publication records remain useful for identifying
the deployed release and designing a replay of the QA sequence.

To reproduce the allowed HTTP check while `dev:prod-ui --live` is running,
compare status and correlation ID only.

```sh
curl -fsS -o /dev/null -w '%{http_code}\n' https://api.nexeloq.com/api/health
curl -fsS http://127.0.0.1:3010/login | grep -o 'LIVE ACTIONS' | head -1
for origin in https://api.nexeloq.com http://127.0.0.1:3010; do
  curl -sS -o /dev/null -D - "$origin/api/auth/me" \
    -H 'Authorization: Bearer acceptance-invalid-fixture' \
    -H 'X-Correlation-Id: release-qa-readonly' |
    awk 'tolower($0) ~ /^(http\/|x-correlation-id:)/'
done
```

## Rollback

1. Stop the profile, sign out and close its browser tab. Return to the Docker
   `dev:local` profile after confirming its ports and DB target.
2. Preserve the workspace/channel/post IDs, claim/operation state and any
   response metadata before resolving a timeout. Gateway protection is
   in-memory. Restart clears that protection. A durable send journal or recovery
   claim must be reconciled against Telegram before another attempt.
3. For a deployed regression, record the current revision and previously
   verified deployment. Compare schema and existing jobs/claims for
   compatibility, then obtain approval for a normal Railway/Vercel rollback.
   Check deployed revision, health and bounded channel reads after rollback.
4. A rollback does not reverse accepted Telegram operations. Reconcile IDs,
   timestamps and content before planning any separately authorized correction.
   Preserve history, journal and attribution. Avoid direct production data edits.

## Manual follow-up

1. Repair the Railway checker to validate Dockerfile build inputs and CI
   contract. Resolve the VP read-model gap and update its test with explicit
   unknown and zero fixtures. Isolate the full Jest crash on the repo CI Node
   version. Review lint and architecture failures against agreed baseline.
2. Restore healthy local ports, bring up a dedicated local PG database on the
   checkout's Compose service, launch `pnpm dev:local`, and verify a disposable
   draft create/reload through Next, API and the same Docker DB.
3. Identify the approved private workspace, channel, named owner and expected
   user role. Use regular login for UI GET and the dedicated operator profile
   for preflight. Check selected channel reads, wrong-channel/workspace denial,
   and disabled mutations. With explicit approval, exercise an ordinary draft
   change and compare API, DB and refreshed UI. Record relay and worker evidence
   without copying private payloads or credential material.
4. Compare old/new owner permissions, visible creators and pagination totals,
   active/expired/revoked links, per-link requested/joined and the separate
   channel queue. Record last confirmed timestamps and partial-read reasons
   through campaign CPA, VP and UI. Cover shared CRM availability and system
   bot rights. Perform invite changes or approve only after separate permission.
5. After explicit approval for exactly one private publication, record the
   workspace, canonical Telegram channel, managed post ID, expected sender,
   content digest and UTC instant. Submit once through the agreed route and
   record the managed post ID, journal outcome, Telegram message ID and
   acceptance time. Inspect remote content and URL privately. Re-read the
   post after UI refresh and confirm one remote message. If the response is
   lost, inspect the journal and remote evidence before any retry. Test denied
   ad/VP/foreign targeting in disposable fixtures and keep unrelated live
   queues out of the test.

## Urgent fix playbook

1. Reproduce locally on Docker or with the Telegram fixture, using an exact
   workspace, channel and post reference.
2. If needed, take a bounded production read from the selected scope and record
   the active deployment ID, observed state and UTC time.
3. Exercise the smallest fix on the local operator with the approved identity,
   least-privilege DB role and scoped cloud relay. Obtain separate action
   permission before a real change. If the route belongs to deployed API, test
   the candidate locally and ship through the normal release route.
4. Verify the live state with a fresh GET plus durable DB/journal evidence and
   remote Telegram evidence for a remote operation. Hold retries when evidence
   is absent.
5. Run focused regression gates, CI checks and builds. Prepare a clean commit
   and PR. Deploy only after explicit approval through the normal release and
   migration process.
6. Verify the actual deployed revision, health, and the bounded affected flow.
   Record pass/fail and the rollback target.

# Инвентаризация scripts до рефакторинга

В HEAD `92fcf5eb` было 67 файлов верхнего уровня. В рабочем дереве найдено 74 с учётом предыдущих незакоммиченных задач.

Для каждой записи перечислены файлы с совпадением полного basename. Категория показывает тип ссылки. Документы включают ручные команды и исторические журналы. Отсутствие ссылки не доказывает, что CLI не используется оператором.

Сканирование включило скрытые отслеживаемые конфиги и hooks. Railway отслеживает весь `scripts/**` и запускает `start-railway.mjs`, который также задан в Dockerfile. CI вызывает проверки через npm scripts. Отдельного repo-конфига Vercel с командами для этих скриптов не найдено. Внешние команды Vercel Dashboard, server-side cron и личные shell aliases недоступны для поиска по репозиторию.

Группы в таблице плановые. До переноса для каждой требуется сверить исполняемые импорты, cwd, `import.meta.url`, правила CI и fallback/пути к конфигурации. Snapshot фиксирует исходные пути до изменений.

| Файл | Группа | Потребители и ссылки по basename |
| --- | --- | --- |
| `ai-lead-qualification-benchmark.mjs` | `qa/crm-ai` | docs `docs/qa/ai-lead-qualification/README.md`<br>docs `docs/qa/ai-lead-qualification/changed-files.txt`<br>docs `docs/qa/ai-sales-crm-final/verification.txt`<br>test `scripts/ai-lead-qualification-benchmark.test.mjs` |
| `ai-lead-qualification-benchmark.test.mjs` | `qa/crm-ai` | docs `docs/qa/ai-lead-qualification/README.md`<br>docs `docs/qa/ai-lead-qualification/changed-files.txt` |
| `ai-sales-copilot-benchmark.mjs` | `qa/crm-ai` | docs `docs/plans/ai-sales-copilot.md`<br>docs `docs/qa/ai-sales-copilot/README.md`<br>docs `docs/qa/ai-sales-copilot/changed-files.json`<br>docs `docs/qa/ai-sales-crm-final/verification.txt`<br>test `scripts/ai-sales-copilot-benchmark.test.mjs` |
| `ai-sales-copilot-benchmark.test.mjs` | `qa/crm-ai` | docs `docs/qa/ai-sales-copilot/README.md`<br>docs `docs/qa/ai-sales-copilot/changed-files.json` |
| `ai-sync-workflow.test.mjs` | `ai/expenses` | Именованных потребителей нет. Standalone или тестовый CLI, сохраняется до проверки. |
| `architecture-policy.mjs` | `quality` | docs `docs/refactoring/PERFORMANCE_FINAL_MANIFEST_2026-08-28.md`<br>test `scripts/architecture-policy.test.mjs`<br>source `scripts/check-architecture.mjs` |
| `architecture-policy.test.mjs` | `quality` | docs `docs/refactoring/PROJECT_REFACTOR_EXEC_PLAN.md`<br>npm `package.json` |
| `build-finance-emoji-search.py` | `build/assets` | Именованных потребителей нет. Standalone или тестовый CLI, сохраняется до проверки. |
| `check-architecture.mjs` | `quality` | source `.codex/agents/file-size-guardian.toml`<br>docs `AGENTS.md`<br>docs `docs/qa/telegram-lead-discovery/changed-files.txt`<br>docs `docs/refactoring/PERFORMANCE_AUDIT_2026-08-27.md`<br>docs `docs/refactoring/PERFORMANCE_FINAL_MANIFEST_2026-08-28.md`<br>docs `docs/refactoring/PROJECT_REFACTOR_EXEC_PLAN.md`<br>npm `package.json` |
| `check-changed.mjs` | `quality` | npm `package.json` |
| `check-env-profile.mjs` | `quality` | npm `package.json` |
| `check-i18n.mjs` | `quality` | npm `apps/web/package.json`<br>npm `package.json` |
| `check-railway-build.mjs` | `deployment` | npm `package.json` |
| `code-graph.mjs` | `quality` | npm `package.json` |
| `dev-api-supervisor.mjs` | `dev` | npm `apps/api/package.json`<br>test `scripts/dev-api-supervisor.test.mjs`<br>test `scripts/environment-contract.test.mjs` |
| `dev-api-supervisor.test.mjs` | `dev` | npm `package.json` |
| `dev-cloudflare-tunnel.mjs` | `dev` | test `scripts/dev-cloudflare-tunnel.test.mjs`<br>source `scripts/dev-products.mjs`<br>source `scripts/dev-tunnel.mjs` |
| `dev-cloudflare-tunnel.test.mjs` | `dev` | Именованных потребителей нет. Standalone или тестовый CLI, сохраняется до проверки. |
| `dev-database-environment.mjs` | `dev` | test `apps/standalone/finance/web/src/components/finance-database-environment-badge.test.tsx`<br>source `apps/standalone/finance/web/src/components/finance-database-environment-badge.tsx`<br>source `scripts/dev-products.mjs`<br>test `scripts/dev-products.test.mjs`<br>source `scripts/dev-tunnel.mjs` |
| `dev-live-parent.cjs` (локальный) | `dev` | source `scripts/dev-production.mjs` |
| `dev-local-database.mjs` (локальный) | `dev` | test `scripts/dev-production.test.mjs`<br>source `scripts/dev-products.mjs` |
| `dev-port-availability.mjs` | `dev` | docs `docs/refactoring/PERFORMANCE_FINAL_MANIFEST_2026-08-28.md`<br>test `scripts/dev-port-availability.test.mjs`<br>source `scripts/dev-production.mjs`<br>source `scripts/dev-products.mjs`<br>source `scripts/dev-tunnel.mjs` |
| `dev-port-availability.test.mjs` | `dev` | docs `docs/refactoring/PERFORMANCE_FINAL_MANIFEST_2026-08-28.md`<br>npm `package.json` |
| `dev-process-termination.mjs` | `dev` | source `scripts/dev-api-supervisor.mjs`<br>test `scripts/dev-process-termination.test.mjs`<br>source `scripts/dev-production.mjs`<br>source `scripts/dev-products.mjs`<br>source `scripts/dev-tunnel.mjs`<br>test `scripts/environment-contract.test.mjs` |
| `dev-process-termination.test.mjs` | `dev` | Именованных потребителей нет. Standalone или тестовый CLI, сохраняется до проверки. |
| `dev-production-gateway.mjs` (локальный) | `dev` | source `scripts/dev-production.mjs`<br>test `scripts/dev-production.test.mjs` |
| `dev-production-policy.mjs` (локальный) | `dev` | source `scripts/dev-production-gateway.mjs`<br>source `scripts/dev-production-profile.mjs`<br>source `scripts/dev-production.mjs`<br>test `scripts/dev-production.test.mjs` |
| `dev-production-profile.mjs` (локальный) | `dev` | source `scripts/dev-production.mjs`<br>test `scripts/dev-production.test.mjs` |
| `dev-production.mjs` (локальный) | `dev` | npm `package.json`<br>test `scripts/dev-production.test.mjs`<br>source `scripts/production-recovery.mjs` |
| `dev-production.test.mjs` (локальный) | `dev` | docs `docs/setup/LOCAL_PRODUCTION_WORKFLOWS.md`<br>npm `package.json` |
| `dev-products.mjs` | `dev` | npm `package.json`<br>test `scripts/dev-production.test.mjs`<br>test `scripts/dev-products.test.mjs`<br>source `scripts/dev-tunnel.mjs`<br>test `scripts/environment-contract.test.mjs` |
| `dev-products.test.mjs` | `dev` | docs `docs/setup/LOCAL_PRODUCTION_WORKFLOWS.md`<br>npm `package.json` |
| `dev-service-readiness.mjs` | `dev` | source `scripts/dev-products.mjs`<br>test `scripts/dev-service-readiness.test.mjs`<br>source `scripts/dev-tunnel.mjs` |
| `dev-service-readiness.test.mjs` | `dev` | npm `package.json` |
| `dev-terminal-dashboard.mjs` | `dev` | source `scripts/dev-products.mjs`<br>test `scripts/dev-terminal-dashboard.test.mjs`<br>source `scripts/dev-tunnel.mjs` |
| `dev-terminal-dashboard.test.mjs` | `dev` | npm `package.json` |
| `dev-tunnel.mjs` | `dev` | docs `README.md`<br>docs `docs/refactoring/PERFORMANCE_FINAL_MANIFEST_2026-08-28.md`<br>npm `package.json`<br>test `scripts/dev-products.test.mjs`<br>test `scripts/environment-contract.test.mjs` |
| `environment-contract.test.mjs` | `deployment` | npm `package.json` |
| `lead-autopilot-benchmark.cjs` | `research/lead-review` | Именованных потребителей нет. Standalone или тестовый CLI, сохраняется до проверки. |
| `lead-autopilot-label.mjs` | `research/lead-review` | docs `docs/qa/lead-discovery-autopilot/README.md`<br>test `scripts/lead-autopilot-label.test.mjs`<br>source `scripts/lead-review-sample-v2.mjs`<br>test `scripts/lead-review-sample-v2.test.mjs`<br>source `scripts/lead-review-sample.mjs`<br>test `scripts/lead-review-sample.test.mjs` |
| `lead-autopilot-label.test.mjs` | `research/lead-review` | Именованных потребителей нет. Standalone или тестовый CLI, сохраняется до проверки. |
| `lead-review-blind.mjs` | `research/lead-review` | test `scripts/lead-review-blind.test.mjs` |
| `lead-review-blind.test.mjs` | `research/lead-review` | Именованных потребителей нет. Standalone или тестовый CLI, сохраняется до проверки. |
| `lead-review-compare-ai-dev.mjs` | `research/lead-review` | test `scripts/lead-review-compare-ai-dev.test.mjs` |
| `lead-review-compare-ai-dev.test.mjs` | `research/lead-review` | Именованных потребителей нет. Standalone или тестовый CLI, сохраняется до проверки. |
| `lead-review-evaluate-cli.test.mjs` | `research/lead-review` | Именованных потребителей нет. Standalone или тестовый CLI, сохраняется до проверки. |
| `lead-review-evaluate.mjs` | `research/lead-review` | docs `docs/qa/lead-discovery-autopilot/README.md`<br>test `scripts/lead-review-blind.test.mjs`<br>test `scripts/lead-review-evaluate-cli.test.mjs`<br>test `scripts/lead-review-evaluate.test.mjs`<br>source `scripts/lead-review-freeze.mjs`<br>source `scripts/lead-review-import-csv.mjs` |
| `lead-review-evaluate.test.mjs` | `research/lead-review` | Именованных потребителей нет. Standalone или тестовый CLI, сохраняется до проверки. |
| `lead-review-freeze.mjs` | `research/lead-review` | test `scripts/lead-review-evaluate-cli.test.mjs` |
| `lead-review-import-csv.mjs` | `research/lead-review` | docs `docs/qa/lead-discovery-autopilot/README.md`<br>source `scripts/lead-review-compare-ai-dev.mjs`<br>test `scripts/lead-review-import-csv.test.mjs` |
| `lead-review-import-csv.test.mjs` | `research/lead-review` | Именованных потребителей нет. Standalone или тестовый CLI, сохраняется до проверки. |
| `lead-review-sample-v2.mjs` | `research/lead-review` | test `scripts/lead-review-sample-v2.test.mjs` |
| `lead-review-sample-v2.test.mjs` | `research/lead-review` | Именованных потребителей нет. Standalone или тестовый CLI, сохраняется до проверки. |
| `lead-review-sample.mjs` | `research/lead-review` | source `scripts/lead-review-blind.mjs`<br>source `scripts/lead-review-sample-v2.mjs`<br>test `scripts/lead-review-sample-v2.test.mjs`<br>test `scripts/lead-review-sample.test.mjs` |
| `lead-review-sample.test.mjs` | `research/lead-review` | Именованных потребителей нет. Standalone или тестовый CLI, сохраняется до проверки. |
| `lead-review-source-links.cjs` | `research/lead-review` | test `scripts/lead-review-source-links.test.cjs` |
| `lead-review-source-links.test.cjs` | `research/lead-review` | Именованных потребителей нет. Standalone или тестовый CLI, сохраняется до проверки. |
| `lead-ui-e2e.cjs` | `research/lead-review` | docs `docs/qa/lead-discovery-autopilot/README.md` |
| `production-ads.mjs` | `production` | npm `package.json`<br>test `scripts/production-ads.test.mjs` |
| `production-ads.test.mjs` | `production` | Именованных потребителей нет. Standalone или тестовый CLI, сохраняется до проверки. |
| `production-recovery.mjs` | `production` | npm `package.json`<br>test `scripts/dev-production.test.mjs` |
| `public-origin-environment.mjs` | `deployment` | source `scripts/dev-products.mjs`<br>source `scripts/dev-tunnel.mjs`<br>test `scripts/environment-contract.test.mjs`<br>test `scripts/public-origin-environment.test.mjs`<br>source `scripts/start-railway.mjs` |
| `public-origin-environment.test.mjs` | `deployment` | npm `package.json` |
| `publication-production-smoke.mjs` | `production` | Именованных потребителей нет. Standalone или тестовый CLI, сохраняется до проверки. |
| `railway-memory-diagnostics.mjs` | `deployment` | test `scripts/railway-memory-diagnostics.test.mjs`<br>source `scripts/railway-memory-reporter.mjs`<br>source `scripts/start-railway.mjs` |
| `railway-memory-diagnostics.test.mjs` | `deployment` | npm `package.json` |
| `railway-memory-reporter.mjs` | `deployment` | source `scripts/start-railway.mjs` |
| `refresh-local-db.mjs` | `db` | npm `package.json` |
| `start-railway.mjs` | `deployment` | Docker `Dockerfile`<br>docs `docs/qa/lead-discovery-autopilot/p3-2-database-upgrade-preflight.md`<br>docs `docs/refactoring/PERFORMANCE_AUDIT_2026-08-27.md`<br>Railway `railway.json`<br>source `scripts/check-railway-build.mjs`<br>test `scripts/environment-contract.test.mjs` |
| `stop-local-dev.mjs` | `dev` | npm `package.json`<br>source `scripts/dev-products.mjs`<br>source `scripts/dev-tunnel.mjs` |
| `sync-finance-brand-assets.mjs` | `build/assets` | npm `apps/standalone/finance/web/package.json`<br>npm `apps/web/package.json`<br>docs `docs/finance-bot/PRODUCT_RULES.md` |
| `sync-local-ai-costs.mjs` | `ai/expenses` | npm `package.json`<br>source `scripts/refresh-local-db.mjs` |
| `verify-crm-migrations.mjs` | `db` | docs `docs/qa/ai-sales-crm-final/changed-files.txt`<br>docs `docs/qa/ai-sales-crm-final/migrations/README.md`<br>test `scripts/verify-crm-migrations.test.mjs` |
| `verify-crm-migrations.test.mjs` | `db` | docs `docs/qa/ai-sales-crm-final/changed-files.txt`<br>docs `docs/qa/ai-sales-crm-final/migrations/README.md` |

## Динамически сформированные пути

- Built-in Node tests перемещаются вместе с относительными импортами и дочерними CLI. Явный список тестов CI проверяется в `package.json`.
- `lead-review-source-links.cjs` выполняет вычисляемый путь к `research/.../export-original.cjs`; этот CLI и его DB/dotenv зависимости образуют отдельную границу.
- `dev-production.mjs` запускает Node через `scripts/dev-live-parent.cjs`. `dev-production-profile.mjs` и `dev-local-database.mjs` разрешают зависимости относительно `apps/api/package.json`. `sync-local-ai-costs.mjs` разрешает ещё и `apps/api/tsconfig.json` через `import.meta.url`.
- `.github/workflows/ci.yml` вызывает `pnpm architecture:check` и `pnpm test:deployment`. `.githooks/pre-push` вызывает `pnpm ai:sync:check`, который запускает `sync-local-ai-costs.mjs` с `--check`.
- При переносе launcher-скриптов нужно проверить `spawn`, `fork`, `createRequire`, динамический `import()` и чтение env из вычисляемых путей. Эта инвентаризация не разрешает удалять записи без ссылок.

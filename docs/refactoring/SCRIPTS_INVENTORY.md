# Инвентаризация скриптов

Исходная точка — `8363f61d` с унаследованным рабочим diff. Перенесены 70 реализаций и тестов. Бизнес-код скриптов сохранён. Файлов, признанных неиспользуемыми и удалённых, нет.

Проверены package scripts, workflow и pre-push hook, Dockerfile и Railway service config, соседние импорты, вычисляемые пути и текущие ручные инструкции. В таблице указаны совпадения по имени файла среди активных потребителей. Исторические QA-отчёты сохраняют прежние пути.

| Старый путь | Текущий путь | Активные ссылки |
| --- | --- | --- |
| `scripts/ai-sync-workflow.test.mjs` | `scripts/ai/ai-sync-workflow.test.mjs` | Standalone CLI / Node test |
| `scripts/architecture-policy.mjs` | `scripts/quality/architecture-policy.mjs` | `scripts/quality/architecture-policy.test.mjs`; `scripts/quality/check-architecture.mjs` |
| `scripts/architecture-policy.test.mjs` | `scripts/quality/architecture-policy.test.mjs` | `package.json` |
| `scripts/build-finance-emoji-search.py` | `scripts/build/assets/build-finance-emoji-search.py` | Standalone CLI / Node test |
| `scripts/check-architecture.mjs` | `scripts/quality/check-architecture.mjs` | `AGENTS.md`; `package.json` |
| `scripts/check-changed.mjs` | `scripts/quality/check-changed.mjs` | `package.json` |
| `scripts/check-env-profile.mjs` | `scripts/quality/check-env-profile.mjs` | `package.json` |
| `scripts/check-i18n.mjs` | `scripts/quality/check-i18n.mjs` | `apps/web/package.json`; `package.json` |
| `scripts/check-railway-build.mjs` | `scripts/deployment/check-railway-build.mjs` | `.github/workflows/ci.yml`; `package.json` |
| `scripts/code-graph.mjs` | `scripts/quality/code-graph.mjs` | `package.json` |
| `scripts/dev-api-supervisor.mjs` | `scripts/dev/dev-api-supervisor.mjs` | `apps/api/package.json`; `scripts/deployment/environment-contract.test.mjs`; `scripts/dev/dev-api-supervisor.test.mjs` |
| `scripts/dev-api-supervisor.test.mjs` | `scripts/dev/dev-api-supervisor.test.mjs` | `package.json` |
| `scripts/dev-cloudflare-tunnel.mjs` | `scripts/dev/dev-cloudflare-tunnel.mjs` | `scripts/dev/dev-cloudflare-tunnel.test.mjs`; `scripts/dev/dev-products.mjs`; `scripts/dev/dev-tunnel.mjs` |
| `scripts/dev-cloudflare-tunnel.test.mjs` | `scripts/dev/dev-cloudflare-tunnel.test.mjs` | Standalone CLI / Node test |
| `scripts/dev-database-environment.mjs` | `scripts/dev/dev-database-environment.mjs` | `apps/standalone/finance/web/src/components/finance-database-environment-badge.test.tsx`; `apps/standalone/finance/web/src/components/finance-database-environment-badge.tsx`; `scripts/dev/dev-products.mjs`; `scripts/dev/dev-products.test.mjs`; `scripts/dev/dev-tunnel.mjs` |
| `scripts/dev-live-parent.cjs` | `scripts/dev/dev-live-parent.cjs` | `scripts/dev/dev-production.mjs` |
| `scripts/dev-local-database.mjs` | `scripts/dev/dev-local-database.mjs` | `scripts/dev/dev-production.test.mjs`; `scripts/dev/dev-products.mjs`; `scripts/dev/dev-products.test.mjs`; `scripts/dev/dev-tunnel.mjs` |
| `scripts/dev-port-availability.mjs` | `scripts/dev/dev-port-availability.mjs` | `scripts/dev/dev-port-availability.test.mjs`; `scripts/dev/dev-production.mjs`; `scripts/dev/dev-products.mjs`; `scripts/dev/dev-tunnel.mjs` |
| `scripts/dev-port-availability.test.mjs` | `scripts/dev/dev-port-availability.test.mjs` | `package.json` |
| `scripts/dev-process-termination.mjs` | `scripts/dev/dev-process-termination.mjs` | `scripts/deployment/environment-contract.test.mjs`; `scripts/dev/dev-api-supervisor.mjs`; `scripts/dev/dev-process-termination.test.mjs`; `scripts/dev/dev-production.mjs`; `scripts/dev/dev-products.mjs`; `scripts/dev/dev-tunnel.mjs` |
| `scripts/dev-process-termination.test.mjs` | `scripts/dev/dev-process-termination.test.mjs` | Standalone CLI / Node test |
| `scripts/dev-production-gateway.mjs` | `scripts/dev/dev-production-gateway.mjs` | `scripts/dev/dev-production.mjs`; `scripts/dev/dev-production.test.mjs` |
| `scripts/dev-production-policy.mjs` | `scripts/dev/dev-production-policy.mjs` | `scripts/dev/dev-production-gateway.mjs`; `scripts/dev/dev-production-profile.mjs`; `scripts/dev/dev-production.mjs`; `scripts/dev/dev-production.test.mjs` |
| `scripts/dev-production-profile.mjs` | `scripts/dev/dev-production-profile.mjs` | `scripts/dev/dev-production.mjs`; `scripts/dev/dev-production.test.mjs` |
| `scripts/dev-production.mjs` | `scripts/dev/dev-production.mjs` | `package.json`; `scripts/dev/dev-production.test.mjs`; `scripts/production/production-recovery.mjs` |
| `scripts/dev-production.test.mjs` | `scripts/dev/dev-production.test.mjs` | `package.json` |
| `scripts/dev-products.mjs` | `scripts/dev/dev-products.mjs` | `package.json`; `scripts/deployment/environment-contract.test.mjs`; `scripts/dev/dev-production.test.mjs`; `scripts/dev/dev-products.test.mjs`; `scripts/dev/dev-tunnel.mjs` |
| `scripts/dev-products.test.mjs` | `scripts/dev/dev-products.test.mjs` | `package.json` |
| `scripts/dev-service-readiness.mjs` | `scripts/dev/dev-service-readiness.mjs` | `scripts/dev/dev-products.mjs`; `scripts/dev/dev-service-readiness.test.mjs`; `scripts/dev/dev-tunnel.mjs` |
| `scripts/dev-service-readiness.test.mjs` | `scripts/dev/dev-service-readiness.test.mjs` | `package.json` |
| `scripts/dev-terminal-dashboard.mjs` | `scripts/dev/dev-terminal-dashboard.mjs` | `scripts/dev/dev-products.mjs`; `scripts/dev/dev-terminal-dashboard.test.mjs`; `scripts/dev/dev-tunnel.mjs` |
| `scripts/dev-terminal-dashboard.test.mjs` | `scripts/dev/dev-terminal-dashboard.test.mjs` | `package.json` |
| `scripts/dev-tunnel.mjs` | `scripts/dev/dev-tunnel.mjs` | `README.md`; `package.json`; `scripts/deployment/environment-contract.test.mjs`; `scripts/dev/dev-products.test.mjs` |
| `scripts/environment-contract.test.mjs` | `scripts/deployment/environment-contract.test.mjs` | `package.json` |
| `scripts/lead-autopilot-benchmark.cjs` | `scripts/qa/lead-review/lead-autopilot-benchmark.cjs` | Standalone CLI / Node test |
| `scripts/lead-autopilot-label.mjs` | `scripts/qa/lead-review/lead-autopilot-label.mjs` | `docs/qa/lead-discovery-autopilot/README.md`; `scripts/qa/lead-review/lead-autopilot-label.test.mjs`; `scripts/qa/lead-review/lead-review-sample-v2.mjs`; `scripts/qa/lead-review/lead-review-sample-v2.test.mjs`; `scripts/qa/lead-review/lead-review-sample.mjs`; `scripts/qa/lead-review/lead-review-sample.test.mjs` · wrapper сохранён |
| `scripts/lead-autopilot-label.test.mjs` | `scripts/qa/lead-review/lead-autopilot-label.test.mjs` | Standalone CLI / Node test |
| `scripts/lead-review-blind.mjs` | `scripts/qa/lead-review/lead-review-blind.mjs` | `scripts/qa/lead-review/lead-review-blind.test.mjs` |
| `scripts/lead-review-blind.test.mjs` | `scripts/qa/lead-review/lead-review-blind.test.mjs` | Standalone CLI / Node test |
| `scripts/lead-review-compare-ai-dev.mjs` | `scripts/qa/lead-review/lead-review-compare-ai-dev.mjs` | `scripts/qa/lead-review/lead-review-compare-ai-dev.test.mjs` |
| `scripts/lead-review-compare-ai-dev.test.mjs` | `scripts/qa/lead-review/lead-review-compare-ai-dev.test.mjs` | Standalone CLI / Node test |
| `scripts/lead-review-evaluate-cli.test.mjs` | `scripts/qa/lead-review/lead-review-evaluate-cli.test.mjs` | Standalone CLI / Node test |
| `scripts/lead-review-evaluate.mjs` | `scripts/qa/lead-review/lead-review-evaluate.mjs` | `docs/qa/lead-discovery-autopilot/README.md`; `scripts/qa/lead-review/lead-review-blind.test.mjs`; `scripts/qa/lead-review/lead-review-evaluate-cli.test.mjs`; `scripts/qa/lead-review/lead-review-evaluate.test.mjs`; `scripts/qa/lead-review/lead-review-freeze.mjs`; `scripts/qa/lead-review/lead-review-import-csv.mjs` · wrapper сохранён |
| `scripts/lead-review-evaluate.test.mjs` | `scripts/qa/lead-review/lead-review-evaluate.test.mjs` | Standalone CLI / Node test |
| `scripts/lead-review-freeze.mjs` | `scripts/qa/lead-review/lead-review-freeze.mjs` | `scripts/qa/lead-review/lead-review-evaluate-cli.test.mjs` |
| `scripts/lead-review-import-csv.mjs` | `scripts/qa/lead-review/lead-review-import-csv.mjs` | `docs/qa/lead-discovery-autopilot/README.md`; `scripts/qa/lead-review/lead-review-compare-ai-dev.mjs`; `scripts/qa/lead-review/lead-review-import-csv.test.mjs` · wrapper сохранён |
| `scripts/lead-review-import-csv.test.mjs` | `scripts/qa/lead-review/lead-review-import-csv.test.mjs` | Standalone CLI / Node test |
| `scripts/lead-review-sample-v2.mjs` | `scripts/qa/lead-review/lead-review-sample-v2.mjs` | `scripts/qa/lead-review/lead-review-sample-v2.test.mjs` · wrapper сохранён |
| `scripts/lead-review-sample-v2.test.mjs` | `scripts/qa/lead-review/lead-review-sample-v2.test.mjs` | Standalone CLI / Node test |
| `scripts/lead-review-sample.mjs` | `scripts/qa/lead-review/lead-review-sample.mjs` | `scripts/qa/lead-review/lead-review-blind.mjs`; `scripts/qa/lead-review/lead-review-sample-v2.mjs`; `scripts/qa/lead-review/lead-review-sample-v2.test.mjs`; `scripts/qa/lead-review/lead-review-sample.test.mjs` · wrapper сохранён |
| `scripts/lead-review-sample.test.mjs` | `scripts/qa/lead-review/lead-review-sample.test.mjs` | Standalone CLI / Node test |
| `scripts/lead-review-source-links.cjs` | `scripts/qa/lead-review/lead-review-source-links.cjs` | `scripts/qa/lead-review/lead-review-source-links.test.cjs` · wrapper сохранён |
| `scripts/lead-review-source-links.test.cjs` | `scripts/qa/lead-review/lead-review-source-links.test.cjs` | Standalone CLI / Node test |
| `scripts/lead-ui-e2e.cjs` | `scripts/qa/lead-review/lead-ui-e2e.cjs` | `docs/qa/lead-discovery-autopilot/README.md` · wrapper сохранён |
| `scripts/production-ads.mjs` | `scripts/production/production-ads.mjs` | `package.json`; `scripts/production/production-ads.test.mjs` |
| `scripts/production-ads.test.mjs` | `scripts/production/production-ads.test.mjs` | Standalone CLI / Node test |
| `scripts/production-recovery.mjs` | `scripts/production/production-recovery.mjs` | `package.json`; `scripts/dev/dev-production.test.mjs` |
| `scripts/public-origin-environment.mjs` | `scripts/deployment/public-origin-environment.mjs` | `scripts/deployment/environment-contract.test.mjs`; `scripts/deployment/public-origin-environment.test.mjs`; `scripts/deployment/start-railway.mjs`; `scripts/dev/dev-products.mjs`; `scripts/dev/dev-tunnel.mjs` |
| `scripts/public-origin-environment.test.mjs` | `scripts/deployment/public-origin-environment.test.mjs` | `package.json` |
| `scripts/publication-production-smoke.mjs` | `scripts/production/publication-production-smoke.mjs` | Standalone CLI / Node test · wrapper сохранён |
| `scripts/railway-memory-diagnostics.mjs` | `scripts/deployment/railway-memory-diagnostics.mjs` | `scripts/deployment/railway-memory-diagnostics.test.mjs`; `scripts/deployment/railway-memory-reporter.mjs`; `scripts/deployment/start-railway.mjs` |
| `scripts/railway-memory-diagnostics.test.mjs` | `scripts/deployment/railway-memory-diagnostics.test.mjs` | `package.json` |
| `scripts/railway-memory-reporter.mjs` | `scripts/deployment/railway-memory-reporter.mjs` | `scripts/deployment/start-railway.mjs` |
| `scripts/refresh-local-db.mjs` | `scripts/db/refresh-local-db.mjs` | `package.json` |
| `scripts/start-railway.mjs` | `scripts/deployment/start-railway.mjs` | `Dockerfile`; `railway.json`; `scripts/deployment/check-railway-build.mjs`; `scripts/deployment/environment-contract.test.mjs` |
| `scripts/stop-local-dev.mjs` | `scripts/dev/stop-local-dev.mjs` | `package.json` |
| `scripts/sync-finance-brand-assets.mjs` | `scripts/build/assets/sync-finance-brand-assets.mjs` | `apps/standalone/finance/web/package.json`; `apps/web/package.json`; `docs/finance-bot/PRODUCT_RULES.md` |
| `scripts/sync-local-ai-costs.mjs` | `scripts/ai/sync-local-ai-costs.mjs` | `package.json`; `scripts/db/refresh-local-db.mjs` |
| `scripts/verify-crm-migrations.mjs` | `scripts/db/verify-crm-migrations.mjs` | `docs/qa/ai-sales-crm-final/migrations/README.md`; `scripts/db/verify-crm-migrations.test.mjs` · wrapper сохранён |
| `scripts/verify-crm-migrations.test.mjs` | `scripts/db/verify-crm-migrations.test.mjs` | `docs/qa/ai-sales-crm-final/migrations/README.md` |

## Вычисляемые пути и внешние потребители

- Railway использует `railway.json` и Docker CMD. Launcher запускает reporter из `scripts/deployment`. Build checker читает артефакты от корня независимо от cwd.
- CI вызывает `pnpm test:deployment`, strict architecture и scoped artifact checks. Pre-push вызывает `pnpm ai:sync:check`. Имена pnpm-команд прежние.
- API supervisor разрешает архив CLI Nest относительно `apps/api`. Operator запускает `scripts/dev/dev-live-parent.cjs`. Dev profile и AI sync используют `createRequire` рядом с API package.
- Labeling, sample, evaluate и source-links используют локальное дерево `research/telegram-ad-filter`. Source-links загружает список источников из локального экспортера только при явном запуске CLI. Обычные тесты используют временный корпус или чистые функции.
- Архив собирает отслеживаемые и неигнорируемые исходники. Docker и Vercel исключают корпус, кеши и локальные артефакты. Приватные данные и ручные labels остались на месте.
- CRM AI wrappers в корне сохраняют существующие прямые команды. Реализации уже находились в `scripts/qa/crm-ai`. Новые wrappers отмечены в таблице.
- Внешние Dashboard-команды и личные алиасы вне репозитория не подтверждены. Удалений на основании отсутствующих ссылок нет.

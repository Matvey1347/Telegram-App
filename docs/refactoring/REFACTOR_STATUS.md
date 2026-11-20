# Статус рефакторинга

## Baseline до правок

Рабочее дерево 20 ноября 2026, HEAD `92fcf5eb`. Baseline включает незакоммиченные изменения предыдущих задач.
`node scripts/check-architecture.mjs` → **FAIL**, exit 1, 24 нарушения.

| Приоритетный файл | Строк по checker | Нарушение длины |
| --- | ---: | --- |
| `apps/web/src/app/(internal)/(telegram)/telegram-posts/page.tsx` | 8094 | Превышен текущий потолок |
| `apps/web/src/app/(internal)/(telegram)/telegram/channels/[id]/page.tsx` | 3633 | Действует переходный потолок |
| `apps/web/src/app/(internal)/(telegram)/telegram-channels/page.tsx` | 2447 | Превышен текущий потолок |
| `apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales.service.ts` | 5776 | Превышен текущий потолок |
| `apps/api/src/telegram/shared/mtproto/telegram-mtproto.client.ts` | 3646 | Действует переходный потолок |
| `apps/api/src/domains/growth/ad-campaigns/ad-campaigns.service.ts` | 2147 | Превышен текущий потолок |

| № | Реальное нарушение до правок |
| ---: | --- |
| 1 | apps/api/src/domains/growth/ad-campaigns/ad-campaigns.service.ts has grown from legacy allowance 1782 to 2147 lines. |
| 2 | apps/api/src/domains/growth/cross-promotion-plans/cross-promotion-plan-scheduling.service.ts is 984 lines, above hard policy 800. |
| 3 | apps/api/src/domains/growth/cross-promotion-plans/cross-promotion-plans.service.ts is 1198 lines, above hard policy 800. |
| 4 | apps/api/src/domains/telegram/bot-billing/bot-billing.service.ts is 1888 lines, above hard policy 800. |
| 5 | apps/api/src/domains/telegram/telegram-ad-sales/dto.ts is 863 lines, above hard policy 800. |
| 6 | apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales.controller.ts is 831 lines, above hard policy 800. |
| 7 | apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales.service.ts has grown from legacy allowance 5453 to 5776 lines. |
| 8 | apps/api/src/domains/telegram/telegram-bots/core/telegram-bot-runtime.service.ts has grown from legacy allowance 888 to 909 lines. |
| 9 | apps/api/src/domains/telegram/telegram-channels/telegram-ai-posting-generator.service.ts is 853 lines, above hard policy 800. |
| 10 | apps/api/src/domains/telegram/telegram-channels/telegram-ai-posting-test-run.service.ts is 830 lines, above hard policy 800. |
| 11 | apps/api/src/domains/telegram/telegram-channels/telegram-channels.controller.ts is 823 lines, above hard policy 800. |
| 12 | apps/api/src/domains/telegram/telegram-channels/telegram-publication-schedules.service.ts is 955 lines, above hard policy 800. |
| 13 | apps/api/src/maintenance/configure-finance-production-runtime.ts reads process.env outside an approved configuration boundary (1 occurrence). |
| 14 | apps/web/src/app/(internal)/(growth)/ad-campaigns/page.tsx has grown from legacy allowance 2382 to 2460 lines. |
| 15 | apps/web/src/app/(internal)/(telegram)/telegram-channels/page.tsx has grown from legacy allowance 2413 to 2447 lines. |
| 16 | apps/web/src/app/(internal)/(telegram)/telegram-posts/page.tsx has grown from legacy allowance 6191 to 8094 lines. |
| 17 | apps/web/src/app/(internal)/(telegram)/telegram-posts/page.tsx imports domain API/helper implementation directly: grew from legacy allowance 6 to 8. |
| 18 | apps/web/src/components/features/growth/ad-campaigns/cross-promotion-plan-view.tsx is 904 lines, above hard policy 800. |
| 19 | apps/web/src/components/features/growth/ad-sales/ad-sales-page.tsx has grown from legacy allowance 948 to 959 lines. |
| 20 | apps/web/src/components/features/growth/ad-sales/ad-sales-sale-details-modal.tsx is 919 lines, above hard policy 800. |
| 21 | apps/web/src/components/features/telegram/telegram/telegram-post-preview.tsx has grown from legacy allowance 948 to 1223 lines. |
| 22 | apps/web/src/components/icons/icon-picker.tsx has grown from legacy allowance 1070 to 1109 lines. |
| 23 | apps/web/src/lib/features/growth/telegram-ad-sales-api.ts is 812 lines, above hard policy 800. |
| 24 | products/finance/web/lib/finance-brand-icon.ts reads process.env outside an approved configuration boundary (1 occurrence). |

## Порядок работ

- [x] CRM AI QA benchmarks. Два CLI и их тесты перенесены в `scripts/qa/crm-ai/`.
- [ ] Следующий slice — offline lead-review corpus (sample, review и evaluate). Отделить DB exporters и UI smoke.
- [ ] Скрипты AI expenses, локальной разработки, защиты deployment и миграций по отдельным связанным группам.
- [ ] Telegram Posts, Channel Details и Channels List. Отдельный slice на ответственность внутри каждого экрана.
- [ ] Ad Sales, MTProto и Ad Campaigns. Отдельный slice на транзакционную или transport-границу.
- [ ] Остальные нарушения из baseline. Для каждого сравнить архитектурный diff.

## CRM AI QA benchmarks

- [Инвентаризация исходных скриптов](SCRIPTS_INVENTORY.md) содержит 67 файлов из HEAD и семь локальных дополнений.
- Новые пути используются в актуальных инструкциях. Старые верхнеуровневые команды запуска перенаправлены тонкими обёртками, поскольку фигурировали в инструкциях операторов. Исторические манифесты изменений сохранены.
- Удалений CLI и тестов нет. Тестовые файлы перемещены вместе с реализацией. Ссылок из npm scripts, CI, hooks, Docker, Railway или Vercel на файлы этой группы не найдено.
- Офлайн-вывод обоих CLI совпадает с baseline при запуске по старым и новым путям из корня репозитория и из `/tmp`. Проверены 60 lead scenarios и 48 copilot scenarios. Незавершённая конфигурация `--live` отклоняется. HTTP-тест использует локальный mock.
- Прошли 8 Node-тестов, typecheck и сборка API и web, а также `git diff --check`.
- `pnpm architecture:check` прошёл 16 тестов правил. Структурная часть завершилась с теми же 24 нарушениями. Новых и снятых нарушений нет. Переходные потолки в этом коммите не менялись.

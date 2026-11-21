# Журнал восстановления Nexeloq и Groshly

**2026-11-21 · Local recovery.** Working-tree diff on base `8363f61d`.
Existing unrelated edits were preserved. Verification used Node 20.19.0 and
pnpm 9.0.0 from the repository configuration. Recovery changes cover the dev
launchers and tests, Finance web proxy and context, LOCAL bot ownership and
consumer auth tests. The full runtime remains `apps/api` on the compatibility
`DATABASE_URL`. The standalone analytics host and its `FINANCE_DATABASE_URL`
are outside the customer path. No extraction or production changes were made.

## Verified

- Finance alone on 3001/4001 with 4000 offline, then `dev:all` on all four
  expected ports. Chrome loaded `/login` in both runs, ignored a stale cached
  bot ID, obtained a real challenge for the selected bot and read the pending
  challenge and unauthenticated session through the same-origin proxy.
  An unknown challenge returned `expired`. The inactive LOCAL runtime also
  refused Mini App bootstrap. SIGTERM released the test listeners.
- Remote URL, nonexistent local database and occupied port were rejected
  before migrations. The valid local Compose database passed
  `db:deploy:safe` and schema verification. The launch guard verifies that the
  named local database can be opened before spawning the migration.
- Local read-only inventory found 2 profiles, 512 ledger rows and 1 Finance
  subscription. The real ledger service created one marked record in a
  PostgreSQL transaction, read it twice without duplication, rejected a
  different profile's detail request and rolled back the test fixture.
- Passed 82 Finance/API tests, 34 launcher tests, 8 targeted web tests and
  72 publication regressions (5 skipped). API and Finance web builds, typechecks for API and
  both web hosts, and lint for the changed web files passed. Broad Finance
  web tests reported 38 failures outside the exercised launch/auth path.
  Global web lint and repository architecture checks also reported existing
  failures.
- Startup adds one local DB connection preflight. LOCAL Telegram ownership
  is checked during explicit tunnel actions. The recovery adds no recurring
  jobs, polling, retained data or per-channel work, including at 100 channels.
- Read-only production probe returned HTTP 200 for the same consumer context
  and session route via Groshly Web and Nexeloq API. The standalone Finance API
  returned a different context and HTTP 404 for that consumer session route.

## Open and exact continuation

`pnpm dev:finance:tunnel` reached the public HTTPS web/API gateway. Telegram
`getMe` rejected the LOCAL token with HTTP 401 before webhook activation.
The local database contains the same rejected token. The Computer Use host
denied access to the Telegram app, so no replacement token was retrieved.

With a valid **LOCAL** token in `products/finance/.env.local`, repeat
`pnpm dev:finance:tunnel`. Follow the test steps in
[Finance setup](../setup/FINANCE_SETUP.md) for live challenge approval,
cookie/session/startup and profile across reload, logout/relogin, Mini App
signed by that bot, bare `/start`, a read-only command and the ledger round trip
from the authenticated UI. Record webhook cleanup after stopping. Keep the
production acceptance for prompt 4 using the metadata and rollback checklist
in the setup guide.

## Prompt 2 · Telegram owner transfer and publication safety

Working-tree diff on `8363f61d`, layered on top of Prompt 1 and the existing
uncommitted recovery work.

- Channel sync resolves the canonical ID and rechecks bounded, connected
  MTProto candidates by stage. Invite, history, metrics and stats failures are
  reported independently. UI refreshes active channel and campaign reads
  after both success and failure.
- Invite pagination preserves completed pages. Joined and requested have
  separate observations, with unknown snapshot values represented as null.
  VP retains stored boundaries and plots joined independently of acquired
  and estimated churn. Campaign refresh persists its latest attempt and
  fences late results by attempt and configuration generation.
- Ordinary native replacement uses the original sender, scoped claim and
  durable journal. Group cancellation denial leaves stored status and IDs
  intact. Channel reset requires explicit IDs, checks ordinary ownership and
  projects each native cancellation only after its acknowledgement.

### Проверка промпта 2

- 226 адресных API-тестов в 29 наборах. В том числе 10 тестов с двумя
  независимыми клиентами disposable PostgreSQL. Проверены захват, потеря ACK, запрет
  отмены из группы, ACK с откатом локальной транзакции, гонка и ABA в окнах
  кампаний, независимые значения `0` и `null`.
- 27 web-тестов в 7 наборах. Активный TanStack Query consumer получил новое
  значение после частичного сохранения и ошибки следующего запроса. Активный
  consumer publishing capabilities перечитал права после изменения access.
  Отдельно проверены серии VP и выбор записей для reset.
- Typecheck и production build API и web, сборка shared, адресный web lint
  и `git diff --check` прошли. Полный API прогон сообщил 29 ошибок в 13
  наборах, среди них Finance, System Bot, импорт и календарный планировщик.
  Глобальные web lint и architecture check также остаются красными.
- Для PostgreSQL использована отдельная база локального Docker Compose.
  `db:deploy:safe` применил обе миграции и прошёл проверку схемы.
  Ответы Telegram в регрессиях контролируемые. Передача рабочего канала,
  удаление production-очереди и production deployment не выполнялись.
  Временная база удалена после тестов. Compose-сервис оставлен запущенным.
- Целевые проверки доступа ограничены подключёнными источниками при явном
  действии. Один probe аккаунта переиспользуется между стадиями sync. Нет
  новых таймеров, polling, фоновых циклов по 100 каналам или политик retention.
  Refresh окна делает две scoped записи на попытку. Сброс перечитывает только
  выбранные записи и связанные активные запросы UI.

### Продолжение для production-приёмки

1. Проверить резервную копию и порядок выкладки двух миграций. Старые клиенты
   Prisma для снимков счётчиков нужно вывести из обращения до включения
   записи nullable-снимков. Существующие строки и известные границы VP
   сохраняются.
2. На двух приватных каналах с тестовыми аккаунтами сохранить исходные
   canonical ID и состояние очереди. Передать только тестовый канал, сделать
   старого владельца недоступным и проверить новый набор прав отдельно для
   Bot API и MTProto. При частичном sync посмотреть, какие стадии сохранились,
   и сверить перезагрузившиеся данные и publishing capabilities в UI.
3. В списке публикаций выбрать обычную локальную и обычную native-запись для
   сброса. Рядом оставить ручную Telegram-запись и записи ad/VP. Сверить
   per-item ответы и очередь оригинального sender, затем повторить с пустым
   выбором. Проверить обычный перенос с исходным sender и плановой датой.
   Просроченные native-записи с неопределённым исходом остаются на ручной
   сверке. При STARTED/UNKNOWN дождаться доказательства исхода по журналу и
   оригинальному sender перед повторной операцией.

## Промпт 3 · Локальный backend и Telegram в Railway

Рабочий diff поверх `8363f61d`. Изменения предыдущих этапов сохранены.

- `dev:local` использует проверенный Compose PostgreSQL. `dev:prod-ui --live`
  использует deployed API. `dev:prod-operator --live` запускает отдельный
  request-only Nest, который выполняет канонический publisher и переход
  выбранного Ad Sales placement. Railway выполняет только операции Telegram,
  связанные с журналом, исходным actor, ревизией и узким scope.
- Operator GET читает пост, историю, группы и календарь из локального
  request-only API. Календарь обходит внутренний cache, а разрешённые
  deployed reads получают scoped bypass response cache. Repair групп
  перенесён в отдельное owner-действие.
- Локальная проверка PostgreSQL использовала отдельные соединения для
  operator, облачного relay и production worker. Изменение локального
  formatter вошло в payload, deployed publisher не вызывался. Проверены
  гонка с worker, старая ревизия, повторный transport call, потеря ответа
  после ACK, UNKNOWN без повтора и сверка placement без повторной отправки.
- 284 адресных API-теста, 12 web-тестов и 34 теста launcher/gateway прошли.
  API и web typecheck/build, Prisma generate, миграции на временной
  PostgreSQL и `git diff --check` прошли. Общий architecture check
  остаётся красным. Дополнительных фоновых процессов или polling нет.
- `pnpm dev:local` поднял web и API, login и health ответили HTTP 200.
  Тестовые процессы остановлены, временная QA-база удалена.
- Chrome открыл `dev:prod-ui` и показал live-баннер. В отдельном браузерном
  тестовом контуре проверены вход с тестовой сессией, scoped workspace и
  канал, открытие черновика, отмена, сохранение и повторное открытие после
  рестарта. Из того же изолированного gateway фактический HTTP NDJSON
  publish вернул `complete/PUBLISHED`, следующий GET вернул `PUBLISHED`.
  Telegram и deployed login в этом контуре заменены тестовым транспортом.
  Живой Ad Sales browser publish оставлен для промпта 4.

### Зависимости и точное продолжение для промпта 4

1. Проверка текущего Railway не обнаружила publication transport v1.
   Обычный operator также остановился до запуска gateway из-за отсутствия
   приватного профиля. Production DB и Telegram в live-проверке не менялись.
2. Применить `20261121122000_operator_send_receipts` и проверить две
   зависимости из промпта 2. В bootstrap Railway включить metadata v1,
   `operator-send`, exact-ID read, fencing и native cancellation ACK вместе
   с Prisma client. Оставить Telegram credentials и session в Railway.
3. Сформировать игнорируемый профиль с restricted Neon role и точными
   тестовыми workspace, channel, user и при необходимости sale/placement.
   В `dev:prod-operator --live` пройти вход и оба flow на приватном канале.
   Сверить локальное изменение formatter в Telegram, ACK, состояние поста,
   placement и календаря после reload. Затем выполнить обычные release gates.

## Промпт 4 · Подготовка выпуска и production evidence

Рабочая ветка `codex/channel-avatar-custom-emoji` на `8363f61d`.
Изменения выпуска остаются в рабочем diff. CI использует `.nvmrc` и
проверяет каждый build artifact в собравшем его job. Оба Railway Dockerfile
собрались на ARM64 с native build tools. CI проверяет оба Finance-хоста
и запускает PostgreSQL-тесты на отдельной базе. Изменения lockfile
отсутствуют. Исправлены тестовые сценарии и сохранение буквальных
обратных кавычек в пересланных постах.

Nexeloq web прошёл 2 107 тестов, Groshly web — 418, standalone Finance
API — 53, deployment checks — 61. Typecheck и сборки приложений прошли.
На временной PostgreSQL прошли обе цепочки миграций и 14 интеграционных
тестов operator/journal. В Chrome открылись обе публичные страницы
входа. Профили, вебхуки и production schema не менялись.

Следующий шаг — закрыть 31 ошибку strict architecture, исправить явный
runtime scope Finance billing и ошибки web lint. Затем повторить
обязательные проверки. На Railway пока отсутствует transport v1,
Telegram вернул 401 при проверке production webhook Finance.
Кандидат не запечатан и не развёрнут. Порядок bootstrap, rollback,
подготовки тестовых объектов и живой проверки записан в
[production acceptance](RECOVERY_PRODUCTION_ACCEPTANCE.md).

## Промпт 5 · Упорядочивание проекта после приёмки

Уборка отложена до успешного production-выпуска и приёмки обоих
продуктов. Повторный strict architecture check на `8363f61d` с рабочим
diff выявил 31 нарушение. Отчёт приёмки по-прежнему имеет статус
BLOCKED. Скрипты и исследовательский корпус не менялись, архив не
создавался. После приёмки пересчитать потребителей по фактическому
дереву и обновить [инвентаризацию](../refactoring/SCRIPTS_INVENTORY.md)
перед первым переносом.

## Продолжение · Локальный рефакторинг до production-приёмки

Условие пятого промпта снято. Правки поверх `8363f61d` сохранены в открытом
рабочем diff. API разделён по обязанностям сервисов, read models и Telegram
transport. Страницы кампаний, каналов и Telegram Posts собирают отдельные
экраны, хуки и компоненты. Сохранены транзакции, claims, оригинальные
sender scopes и scoped invalidation. Для Finance billing восстановлено
чтение выбранного runtime. Создание invite link сохраняет выбранного
актора и его отображаемые данные при обновлении источников в полёте.

Перенесены 70 скриптов и тестов. Точные пути, потребители и оставленные
wrappers есть в [инвентаризации](../refactoring/SCRIPTS_INVENTORY.md).
Ни один файл не удалён как неиспользуемый. Исследовательский корпус и
ручные метки остались на месте. Тестовые CLI работают на временных
синтетических данных. Инструкция к ZIP — в [Source archive](../setup/SOURCE_ARCHIVE.md).

Проверки: strict и обычная архитектура прошли, лимиты не увеличены.
API — 4 344 прошедших теста и 34 пропуска. Ещё 14 PostgreSQL-тестов
operator/journal выполнены отдельно после применения миграций к
временной БД. Nexeloq web — 2 110, Finance web — 419, standalone
Finance API — 53. Deployment scripts — 65,
offline tooling — 41 Node-тест и тест фильтра архива. I18n и
проверка Docker context прошли. Временная PostgreSQL удалена.

`ai:sync` и `ai:sync --execute` показали ноль ожидающих и вставленных
записей. `release:check` прошёл AI и архитектуру, затем остановился
на lint. Производственных деплоев, миграций и Telegram-мутаций не было.
Точный порядок повторного выпуска и живой приёмки в
[отчёте](RECOVERY_PRODUCTION_ACCEPTANCE.md).

С ZIP выполнены CRC-проверка, распаковка в пустой каталог, frozen
install, offline tooling, deployment tests, strict architecture и
сборки API и web. В исходном checkout собраны также оба Finance-хоста.
Docker context содержит исходники, миграции и env templates, а
приватный corpus, реальные env и графовые кеши исключены.

## Повторная проверка перед выпуском

Типизация аналитики канала и исправления React lint в расчёте доступных
слотов, предпросмотре цены и репортёре ошибок сократили web lint с 110 до
86 ошибок. Web typecheck, Next.js build и 44 адресных теста прошли. Новый
`release:check` прошёл AI-сверку и архитектуру, затем остановился на
web lint. Production Neon, Railway и Vercel не менялись.

## Проверка production-миграций · 21 ноября 2026

На Neon в режиме чтения подтверждены 356 применённых миграций и три
ожидающие из candidate `baeb08d8`. Незавершённых миграций нет.
Подтверждён Railway predeploy `pnpm --filter api run db:deploy:safe`.
Strict architecture прошёл по 2 266 файлам. Повторный `release:check`
остановился на прежних 86 ошибках web lint. Миграции и production deploy
ожидают прохождения gate. Особенно важна совместимость прежних readers
со snapshot counters, которые после обновления могут содержать null.

Во время проверки в 20:52–20:53 UTC обе страницы входа и readiness
standalone Groshly ответили HTTP 200. Nexeloq API сначала превысил лимит
ожидания, затем вернул HTTP 500 на /api/health. Railway зарегистрировал
ошибку proxy для этого endpoint. Причина недоступности backend пока
не установлена. Проверка проходила на ранее развёрнутой версии.

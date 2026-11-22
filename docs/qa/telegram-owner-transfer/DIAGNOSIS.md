# Диагностика Telegram после передачи владельца канала

Дата расследования — 20 ноября 2026, Europe/Warsaw. Основание — код текущего
checkout, воспроизводимые fixtures, официальные контракты Telegram и отдельно
отмеченные исторические результаты QA. Production DB и Telegram-сессии в этом
проходе не открывались. Для нового live-сравнения нужны согласованный канал,
точный workspace и подтверждённый read-only доступ для старого и нового аккаунта.
Доказательств активного production P0 в этом проходе нет.

**CONFIRMED** означает, что указанная ветка подтверждена кодом, а для P1 также
исполняемой fixture. **HYPOTHESIS** означает, что симптом зависит от фактической
видимости, прав, состояния БД или поведения развернутой версии и требует
сравнения аккаунтов. P1 обозначает потерю доступной операции, ложный статус
полноты, повреждение подтверждённой метрики или повтор неопределённой удалённой
операции. Тесты с OT-номерами фиксируют текущее проблемное поведение. При
исправлении соответствующий assert нужно заменить инвариантом из последней
колонки.

## Матрица расследования

В путях ниже `channels` означает
`apps/api/src/domains/telegram/telegram-channels`, `mtproto` означает
`apps/api/src/telegram/shared/mtproto`. Все результаты сравниваются в одном
workspace и по одному каноническому Telegram channel ID.

| Сценарий до/после передачи | Путь API → сервис → Telegram → БД → UI | Наблюдение | Root cause / статус | Severity | Предлагаемое исправление | Тест |
| --- | --- | --- | --- | --- | --- | --- |
| OT-01. Новый владелец или админ с правом invite, два активных аккаунта, прежний владелец помечен OWNER | `POST telegram-channels/:id/invite-links/register` → `TelegramInviteLinkRegistrationService.register` → `bestMtprotoSource(INVITE_LINKS)` → один `GetExportedChatInvite` → `TelegramInviteLink` → селектор, импорт в кампанию, VP и cross-promo | При cached OWNER без invite-capability и ADMIN с ней выбран OWNER. Неудача первого аккаунта завершает регистрацию. Priority publisher здесь роли не играет. | CONFIRMED. В [bestMtprotoSource](../../../apps/api/src/telegram/shared/imports/telegram-source-access.service.ts#L683) фильтр общий для аналитики. Бонус роли превышает бонус invite. [Регистрация](../../../apps/api/src/domains/telegram/telegram-channels/telegram-invite-link-registration.service.ts#L49) делает один lookup. Отказ Telegram на конкретной старой ссылке зависит от роли и автора. | P1 | Для чтения выбирать по capability и свежести. На определённый отказ чтения проверять ограниченный список допустимых источников того же канала, отдельно учитывать известного creator. | OT-01, cached OWNER/eligible ADMIN и контроль с eligible OWNER. После фикса запустить registration с отказом первой сессии и успехом второй. |
| OT-02. Старые и новые, active/expired и revoked ссылки, короткая страница, повтор cursor или лимит страниц | `sync-now` → `syncHistorical` → `GetAdminsWithInvites` + `GetExportedChatInvites` по creator и revoked → `finalizeInviteLinkSync` → `TelegramChannelDataSource` → отчёт sync | 1 уникальная ссылка из объявленных 2 или 5 получает `ALL_ADMINS`. БД записывает SUCCESS даже с `missingTotalLinks > 0`. Отсутствующие ссылки сами по себе не удаляются. | CONFIRMED. [Сборщик страниц](../../../apps/api/src/telegram/shared/mtproto/telegram-mtproto.client.ts#L2299) не сверяет `response.count` и не возвращает статус завершения ветки. [Scope](../../../apps/api/src/telegram/shared/mtproto/telegram-mtproto.client.ts#L2795) зависит от failedAdmins. [Финализация](../../../apps/api/src/domains/telegram/telegram-channels/telegram-invite-sync.service.ts#L205) считает недобор после определения статуса. | P1 | Вести expected/fetched unique и причину завершения по actor/creator/active/revoked. Отдельно обозначать намеренный cutoff. Сохранять позитивные наблюдения с частичным статусом. | OT-02. После фикса добавить пустой/повторный cursor, дедупликацию active/revoked, timeout и намеренный cutoff. |
| OT-03. Joined или pending за период по старой ссылке | `invite-windows/refresh` → register → `GetChatInviteImporters(link, requested)` → `AdCampaignInviteLinkWindow` → joined/pending и CPA | `count=4, importers=[]` возвращает 0 для обоих режимов. Короткая страница тоже считается концом без сверки count. | CONFIRMED. [Периодный счётчик](../../../apps/api/src/telegram/shared/mtproto/telegram-mtproto.client.ts#L2987) не читает count и считает границу по длине страницы или дате. Реальное появление такой страницы у Telegram не подтверждено. | P1 | Сверять полученную выборку и заявленный count, валидировать cursor и порядок дат. Возвращать unknown при недоказанной полноте, 0 при доказанном пустом диапазоне. | OT-03, joined и requested. После фикса добавить полную выборку, явный count=0 и нисходящий cutoff. |
| OT-04. Уже проверенное окно кампании, затем потеря доступа, timeout или incomplete | `invite-windows/refresh` → `AdCampaignInviteWindowsService.refresh` → register/importers → `updateMany` → campaign detail/list | Из ранее подтверждённых 12/3 исчезают оба числа и дата вычисления. Смена даты окна также сбрасывает значения, что для нового диапазона ожидаемо. | CONFIRMED. [catch refresh](../../../apps/api/src/domains/growth/ad-campaigns/ad-campaign-invite-windows.service.ts#L74) очищает подтверждённый снимок при любом исключении. Старый refresh той же конфигурации способен затереть более свежий при обратном порядке ответов. | P1 | Хранить последнее подтверждение и отдельный результат попытки. Защитить обновление версии окна и порядка попыток. Не формировать KPI из неизвестных счётчиков. | OT-04, отказ и incomplete на ранее заполненном окне. После фикса добавить два refresh с обратным порядком завершения. |
| OT-05. Отмена ordinary native schedule через старого sender после потери ответа | `return-to-draft` / DELETE / scheduled edit → `TelegramManagedPostPublicationService.cancelScheduledManagedPost` или `TelegramManagedPostMoveService.deleteManagedPost` → `DeleteScheduledMessages` → revision/статус → редактор | После принятого Telegram delete и потерянного ответа повторный запрос посылает те же ID без чтения очереди. Первая ошибка предшествует записи нового состояния DB. | CONFIRMED для `cancelScheduledManagedPost`. [Прямая отмена](../../../apps/api/src/domains/telegram/telegram-channels/telegram-managed-post-publication.service.ts#L356) и [DELETE](../../../apps/api/src/domains/telegram/telegram-channels/telegram-managed-post-move.service.ts#L437) используют сохранённого sender и IDs без claim/evidence в этом участке. Последствия второго RPC после передачи канала живьём не установлены. | P1 | Переиспользовать существующие проверки области, claim и remote evidence для отмены. Положительное доказательство идентичности до мутации и подтверждённый исход до повторной отправки. Не менять ad/VP lane. | OT-05, удаление принято, ACK потерян, второй вызов видит изменённую fixture-очередь. После фикса проверить точные ID, отсутствие replay и переход DB при доказанном результате. |
| OT-06. Старый владелец потерял админку, старый admin-link пропал после refresh, новый ещё не сопоставлен | `telegram-user-accounts/:id/sync-dialogs` → `syncDialogs` → админские dialogs → `TelegramChannelAdminLink` / `TelegramChannelSourceAccess` → Sources, Publish, Create invite | При успешном диалоге с пустой админской выборкой старый admin-link удалён, а OWNER capability переживает refresh. `sourcesForChannel` проверяет статус аккаунта и существование строки access без требования совпадающего admin-link. | CONFIRMED. [syncDialogs](../../../apps/api/src/domains/telegram/telegram-user-accounts/telegram-user-accounts.service.ts#L632) пересоздаёт admin-link в транзакции, upsert делает только для найденных каналов. Если старый владелец остался админом и найден, upsert обновит права. | P1 | Согласовывать обе таблицы на успешной проверенной выборке, неполные результаты отмечать stale. Отрицательное право подтверждать точечным TG lookup при недостаточной полноте списка. | OT-06. После фикса former OWNER→ADMIN, потеря прав, неполный dialog scan, новый owner без access row и отсутствие reconnect. |
| OT-07. Прежний владелец может читать публичные посты, invite directory отказал | `sync-now` или `sync/historical` → `TelegramChannelHistoricalSyncService.syncHistorical` → getMessages и invite enumeration → публикации/метрики DB → sync UI | Чтение истории уже успешно, затем `CHAT_ADMIN_REQUIRED` от приглашений отменяет весь результат. Исторический адаптер всегда читает приглашения. Даже при DTO без syncInviteLinks ему не передают запрет. И наоборот, invite-only всё равно читает посты. | CONFIRMED. [Адаптер истории](../../../apps/api/src/telegram/shared/mtproto/telegram-mtproto.client.ts#L1900), [вызывающий сервис](../../../apps/api/src/domains/telegram/telegram-channels/telegram-channel-historical-sync.service.ts#L189) и [общий catch](../../../apps/api/src/domains/telegram/telegram-channels/telegram-channel-sync.orchestrator.ts#L211). | P1 | Передавать выбранные этапы, держать их причины/результаты отдельно и сохранять успешную ветку. Выбирать источники по этапу. | OT-07. После фикса повторить history-only, invite-only и составную попытку со статусом PARTIAL. |
| OT-08. Прежний владелец остаётся admin с inviteUsers либо удалён, видимость ссылок разных creators | sync/register → `GetAdminsWithInvites`, `GetExportedChatInvites(adminId, revoked)`, `GetExportedChatInvite(link)` → строки ссылки → селекторы | TDLib документирует право администратора читать собственные ссылки и owner-привилегию для чужих. В приложении директория может перечислить меньше creators, чем реально существовало, даже если все показанные строки прочитаны. | HYPOTHESIS для конкретного канала, старой ссылки, revoked/expired и конкретного MTProto RPC. Ошибка/отсутствие строки могут означать scope, истечение, отсутствие или pagination. | P1 при восстановимой недоступности | Сравнить одинаковое множество известных links по двум аккаунтам и creator. Для revoked/expired оставить исторический read model. Registration сознательно отклоняет их как доступные для нового назначения. | Read-only A/B ниже. В fixtures раздельные active/revoked списки, creator без usable input user, прежний админ читает только своё. |
| OT-09. Новый владелец подключён, но отсутствует в AdminLink и SourceAccess, либо явно указан пользователем | sync/stats → `connectedAccount`, `bestMtprotoSource` → Telegram → DB/отчёт | Без preferred ID берётся самый ранний admin-link активного connected аккаунта. Явный ID проверяет принадлежность workspace и состояние аккаунта, сам по себе не подтверждает связь или capability для канала. `syncNow` выбирает один STATS actor для нескольких этапов. | CONFIRMED по коду [connectedAccount](../../../apps/api/src/domains/telegram/telegram-channels/telegram-channel-access.service.ts#L508) и [syncNow](../../../apps/api/src/domains/telegram/telegram-channels/telegram-channel-sync.orchestrator.ts#L72). Реальный отказ или успешный Telegram доступ для данного аккаунта — HYPOTHESIS. | P2 как различие политик источника | Явно разделить import/discovery, обычный read и privileged operation. Перед изменением требовать известный target и подходящую capability. | Актор того же workspace без link и аккаунт другого workspace. Сохранить explicit discovery и workspace изоляцию. |
| OT-10. Создание новой ссылки и ручное добавление старой | `invite-links/create` → filtered `sourcesForChannel` → `ExportChatInvite` → upsert → inline selector. `register` читает существующую ссылку с учётом channel peer. | Create требует сохранённый canManageInviteLinks и выбирает явный ID или первый источник. Timeout после отправки запроса имеет неопределённый исход. Селектор добавляет подтверждённый create-ответ сразу и помечает invite-list stale с `refetchType: none`. | CONFIRMED ветки кода. HYPOTHESIS, что повтор create создал дубликат либо stale capability скрыла/показала исходный выбор. | P2 | При определённом отказе обновлять доступ по запросу. При неизвестном исходе сверить список новых ссылок и не делать blind export retry. | Два creators с разными правами, окно формы после смены роли, accepted-but-disconnected fixture. |
| OT-11. Живая очередь после пакетного approve и неполное чтение | channel info → `GetFullChannel` и unfiltered `GetChatInviteImporters(requested, limit=1)` → `channelIdentityPatch` → `TelegramChannel.pendingJoinRequestsCount` / audience snapshot → карточки | Реальный 0 принимается. При отказе возвращается null. Public-info пробует до двух сохранённых доступных альтернатив и сохраняет старое число, если подтверждения нет. Исторический адаптер читает очередь, но возвращает только links/scope/expected/warnings, поэтому этот результат не доходит до финализации historical invite sync. | CONFIRMED. [livePending](../../../apps/api/src/telegram/shared/mtproto/telegram-pending-join-requests.ts), [public-info fallback](../../../apps/api/src/domains/telegram/telegram-channels/telegram-channel-historical-sync.service.ts#L83), [historical projection](../../../apps/api/src/telegram/shared/mtproto/telegram-mtproto.client.ts#L1992). | P2 | Пронести доказанное значение и checkedAt без лишнего RPC либо оставить один авторизованный путь измерения. В карточке разделить сохранённое число и свежесть проверки. | Существующий pending helper и `invite-links-sync.spec`. Добавить historical-only: 0, null, alternate, старый сохранённый count. |
| OT-12. Отсутствующий creator профиль, текущие счётчики, ad attribution и история | invite sync → creator mapping → `TelegramInviteLink` / snapshots → campaign, channel traffic attribution, VP boundary | При отсутствующем профиле сборщик может взять `params.adminUser`, что и переносит его ID/имя в snapshot другой записи. Timestamp истории отражает обновление строки, а не полноту сканирования всех creators. `adCampaignId` сохраняется при импорте, автоматической привязки по title нет. | CONFIRMED по [creatorSnapshot](../../../apps/api/src/telegram/shared/mtproto/telegram-mtproto.client.ts#L2321) и [upsert](../../../apps/api/src/domains/telegram/telegram-channels/telegram-invite-sync.service.ts#L77). Частота неправильного creator в реальных ответах при global fallback — HYPOTHESIS. | P2 | Сохранять `invite.adminId` отдельно от профиля, оставлять профиль unresolved, при частичном наблюдении не переносить actor identity в creator. | Global fallback, creator исчез из `users`, совпадающие username, неизменная explicit campaign binding. |
| OT-13. Метрики кампаний, атрибуция VP и старые snapshots | sync → `TelegramChannelAdmissionSyncService`, `AdCampaignAdmissionAnalyticsService`, campaign windows / VP boundary → SQL snapshots → таблицы, графики и ставки | Admission stage получает флаги выбора, а не статусы completed/partial. Затем читает фактические snapshots. Наличие неправильного начисления зависит от записей. VP фиксирует current joined/requested на границах, поэтому старые значения могут стать baseline. Кампания помечает unavailable, но list API формирует numeric 0; таблица показывает предупреждение по флагу. | CONFIRMED цепочка флагов и интерфейса. HYPOTHESIS, что конкретный KPI/VP baseline неверен после передачи. | P2 | Передавать статус и evidence от обоих этапов, выбрать policy для ожидающих/устаревших baseline. Проследить потребителей, игнорирующих `periodCountsUnavailable`. | Partial invites + successful metrics, после timeout нет новых подтверждённых точек, затем повтор с полными данными. |
| OT-14. Обычная публикация и native recovery при новом priority publisher | managed-posts publish/reschedule stream → publisher / rescheduler → existing queue/history и облачный relay → claim/native recovery store → редактор | При publish кандидаты берутся из сохранённых sources и canPost; отдельно учитываются enabled/priority и для некоторых операций существующий sender. Recovery проверяет точные доказательства, сохраняет LOCAL, исключает ad/VP/batches и блокирует неоднозначную замену. Внешние ручные посты не следует причислять к кандидатам по сходству текста. | CONFIRMED реализация и ранее задокументированная QA. Наличие новой ошибки send после передачи — HYPOTHESIS. | Watch, при дедлайне P0 triage | Проверить реальные права выбранного нового publisher и старого sender. Переиспользовать уже имеющийся recovery/claim/journal. | Существующие transport, repair, rescheduler, recovery module и deadline suites. Проверить external/manual IDs отдельно, без replay. |
| OT-15. Реклама, direct/folder VP, истекшая публикация и cleanup | ad-sale schedule/publish и VP activation/lifecycle → canonical publication/dispatcher → Telegram → placement/delivery и send journal → ads/VP UI | Рекламная аналитика и tracking links относятся к другим операциям. Priority или bot access могут препятствовать фактической доставке, но подтверждённый инцидент здесь отсутствует. Maintenance/deletion/analytics не должны удерживать due lane. | CONFIRMED путь [ad sales](../../../apps/api/src/domains/telegram/telegram-ad-sales/telegram-ad-sales.service.ts#L4885), [VP lifecycle](../../../apps/api/src/domains/growth/mutual-promotion-folders/mutual-promotion-lifecycle.service.ts) и [deadline evidence](../../telegram/PUBLICATION_RELIABILITY.md). HYPOTHESIS для конкретного transfer. | Watch, при дедлайне P0 triage | Отдельно сравнить intended time, claim, journal ACK, post/source, placement/VP state, права бота и Telegram evidence. Не использовать обычный reschedule для ad/VP. | Due predicate, hung maintenance, per-post claim, session abort и publication/maintenance isolation. |
| OT-16. CRM на общей сессии, System Bot и workspace bot | CRM runtime → MTProto session pool/lease → диалоги; bot access check → `getChatMember` → SourceAccess → capability UI | Смена владельца канала сама по себе не доказывает отказ CRM сессии. Пул разделяет физическое соединение и заёмные представления. Bot check проверяет текущую роль и может очистить устаревшее право. При stale-positive publisher сначала использует источник из БД. | CONFIRMED путь [session factory](../../../apps/api/src/telegram/shared/mtproto/telegram-mtproto-session.factory.ts) и [bot access](../../../apps/api/src/domains/telegram/telegram-channels/telegram-channel-access.service.ts#L230). HYPOTHESIS для CRM disconnect или оставшегося старого bot grant. | P2 / P1 при воспроизводимом сбое | Раздельно сравнить состояния сессии, workspace runtime owner и удалённые права канала. При fixture timeout сохранить ownership до подтверждённого закрытия. | Existing session factory, CRM runtime manager, channel bot access и source-selection suites. |
| OT-17. Канал исчез из dialogs старого аккаунта, сохранённый username уже у другого канала | sync/publish → `resolveStoredChannel` → dialog ID, stored peer, fallback username/invite → Telegram RPC, сохранение identity → channel/editor | Fixture с сохранённым ID и переиспользованным username возвращает peer и ID другого канала. Historical sync затем может записать resolved identity для старой строки. Возможное влияние на конкретную отправку требует проверки deployed call path. | CONFIRMED для [fallback resolver](../../../apps/api/src/telegram/shared/mtproto/telegram-mtproto.client.ts#L1260) и отсутствия сравнения в [persistResolvedChannelIdentity](../../../apps/api/src/domains/telegram/telegram-channels/telegram-channel-access.service.ts#L401). HYPOTHESIS для production misdelivery. | P1, P0 при доказанном неверном target | В shared resolver сверять канонический ID до выдачи peer для read/write; отклонять mismatch и отдельным запросом исправлять identity. Не использовать другой канал как успешный fallback. | OT-17. После фикса добавить stale invite, совпадающий ID при rename и проверку, что на несовпавший peer не отправляется Telegram mutation. |

## Как читать источники, полноту и метрики

- `TelegramChannelAdminLink` связывает импортированный аккаунт с каналом.
  `TelegramChannelSourceAccess` хранит роль, отдельные capability-флаги и
  `lastCheckedAt`. `TelegramChannelDataSource` хранит наблюдение для конкретного
  data type. Connected session, priority publisher, наличие admin-link,
  последняя успешная синхронизация и текущие права Telegram отвечают на разные
  вопросы. Отдельный `sync-dialogs` возможен без reconnect, но читает до 200
  dialogs. Отсутствие канала за пределами выборки не подтверждает отзыв прав.
  Проверка аккаунта и freshness premium-capabilities не заменяют проверку
  членства в нужном канале. Роль OWNER даёт высокий score, `canViewStats`
  из наличия adminRights — лишь эвристика, а доступ к статистике подтверждает
  ответ `GetBroadcastStats`.
- Telegram возвращает каталог creators, затем отдельные страницы их активных
  и отозванных ссылок. Текущие размер страницы и предел — 100 и 200 на ветку.
  Collect дедуплицирует ссылки, заканчивает на cutoff, короткой странице или
  повторе cursor. Ветки active/revoked идут через `Promise.all`: ошибка одной
  исключает обе из итогового массива этого автора, хотя callback другой ветки
  уже мог сохранить строки historical sync. Global fallback работает только
  при недоборе и наличии failed admin либо нулевой выборке. Он способен сбросить
  failedAdmins по общему количеству уникальных ссылок, хотя покрытие каждого
  автора по отдельности не доказано. Полный отказ по каталогу пробрасывается,
  а все неудавшиеся expected-admin ветки дают ошибку. Пустой доступный каталог
  может выглядеть как успешные 0/0. Отчёт должен различать «0 в доступном
  разделе» и «проверено, что в канале 0». До и после передачи сравнивать
  сумму каталога, count страниц, число уникальных сохранённых и видимость
  creators независимо. [Telegram invite directory](https://core.telegram.org/method/messages.getAdminsWithInvites), [exported invites and pagination](https://core.telegram.org/method/messages.getExportedChatInvites), [TDLib permissions by creator](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1get_chat_invite_links.html).
- `TelegramInviteLink.joinedCount` — последнее сохранённое Telegram usage
  конкретной ссылки. Приложение трактует её `requestedCount` как
  текущее pending-наблюдение. TDLib выделяет per-link pending отдельно,
  а описание raw MTProto `requested` неоднозначно относительно `usage`. Список и история суммируют joined и requested
  как продуктовую метрику attributed. Это не число уникальных людей и не
  нетто-прирост. Текущий маппер подставляет 0, если числового поля нет.
  Telegram TL использует optional fields. По одному отсутствующему полю
  нельзя доказать, что оно скрыто из-за роли: сначала нужно сравнить raw
  flags и explicit 0 на одном link у двух акторов. При подтверждённом
  ограничении видимости сохранять последнюю достоверную точку и показывать
  unknown для новой попытки. Совместимость Prisma/schema fallback также
  проецирует отсутствующий requestedCount в 0. Это отдельная причина, для
  которой следует сверить развернутый Prisma client и схему.
  [MTProto exported invite](https://core.telegram.org/constructor/chatInviteExported), [TDLib invite counters](https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1chat_invite_link.html).
- `TelegramChannel.pendingJoinRequestsCount` — последний подтверждённый
  результат прямого channel-wide запроса pending. Он включает заявки вне
  набора видимых ссылок. Сумма link requested здесь недопустима. Live helper
  не использует потенциально устаревшее `ChannelFull.requestsPending`.
  Единичный `GetFullChannel` также не доказывает invite visibility. При
  `CHAT_ADMIN_REQUIRED`, timeout или malformed count получить цифру с этого
  источника нельзя. Сохранённое значение остаётся последним подтверждённым.
  [Telegram importers](https://core.telegram.org/method/messages.getChatInviteImporters), [full channel fields](https://core.telegram.org/constructor/channelFull).
- `AdCampaignInviteLinkWindow.pendingCount` — число *ещё ожидающих*
  importers по конкретной ссылке с датой в окне `[from, until)`.
  `fromDate` переводится из timezone кампании в UTC. Это не число всех
  исторически поданных заявок: одобренных, отклонённых и отменённых в текущей
  pending-выборке нет. Реактивировать число можно из доказанных snapshot/event
  данных, если они существовали на тот момент. Revoked/expired link может
  сохранить исторические точки, даже когда Telegram больше не позволяет
  пересчитать окно через текущую регистрацию.
- В HTTP read models invite list и history получают записанные строки и
  snapshots, а `analytics-sources` строит latest attribution по data type.
  `usedFor` фильтрует текущий набор источников, однако `dataAttribution`
  формируется из последних исторических rows и может показывать старый
  source SUCCESS. Одинаковый SUCCESS намеренно не создаёт новую запись, так
  что `syncedAt` в этом представлении не всегда время последней проверки.
  Channel overview отображает pending число из booking/traffic read model,
  а per-link table использует requestedCount. Статус PARTIAL доступен при
  sync, если API его верно вычислил, и не передаётся последовательно на
  каждое число. Старый cached result может выглядеть актуальным при уже
  отозванном доступе. См. [analytics attribution](../../../apps/api/src/telegram/shared/imports/telegram-source-access.service.ts#L561)
  и [channel detail](../../../apps/web/src/app/%28internal%29/%28telegram%29/telegram/channels/%5Bid%5D/page.tsx#L2537).

## Query cache и границы исправления

- `invalidateTelegramAccessQueries` обновляет accounts, sourceChannels,
  sources, publishingCapabilities, analyticsSources, списки и селекторы
  после account/bot mutations. Он не исправляет сохранённую ложную роль
  OT-06. Отдельно проверить channel detail с adminLinks и второй таб, если
  они остались открыты на старых данных.
- `invalidateTelegramChannelQueries` инвалидирует списки, detail, analytics,
  invite lists, snapshots, managed posts и campaign list после канального sync.
  Workspace bulk scope modal целенаправленно обновляет списки и traffic
  attribution, без fan-out по каждой detail странице. Invite inline create
  сразу кладёт результат в initial selector cache, а invite list помечает
  stale. Все открытые read models сверять после partial/failure, так как
  historical callback может сохранить часть данных до ошибки. Предлагаемая
  точка для изменения — [общая инвалидация](../../../apps/web/src/lib/features/telegram/telegram-query-invalidation.ts).
- Сохранение окон кампании использует query key
  `["ad-campaign-invite-windows", id]` и отдельные campaign keys. В
  follow-up использовать фабрику для window, detail и списков, включая
  ручной retry и stale/unknown. Серверный флаг `periodCountsUnavailable`
  уже используется таблицей. Отдельно проверить CSV, сводную метрику и
  consumers list API перед изменением numeric/null контракта.
- Документация owner-transfer фиксирует исторический production случай,
  где fallback по admin-link выбрал неподходящего reader. Позднее recovery
  reader стал использовать priority publisher; затем проверены обычные
  native schedules по свежим ID и ACK. Это доказательство по публикации,
  с конкретными версиями и моментом проверки. Оно не подтверждает полноту
  invite, stats или CRM для этих каналов на дату данного расследования.
  [Историческая проверка](../../telegram/CHANNEL_RESCHEDULING.md).

## Порядок исправлений и конкретные файлы

1. **OT-17, OT-06, OT-01 — идентичность канала и доступ.**
   `telegram-user-accounts/telegram-user-accounts.service.ts`,
   `telegram/shared/imports/telegram-source-access.service.ts`,
   `channels/telegram-channel-access.service.ts`,
   `channels/telegram-invite-link-registration.service.ts`. Сначала
   проверка canonical ID в `mtproto/telegram-mtproto.client.ts`, затем
   reconcile двух таблиц с проверкой полноты и capability-aware actor
   policy и ограниченный fallback только на чтении. Проверить небезопасные
   defaults каждого вызывающего, без автоматического переключения write.
2. **OT-02, OT-03, OT-07, OT-11, OT-12 — доказанное покрытие Telegram.**
   `mtproto/telegram-mtproto.client.ts`,
   `channels/telegram-channel-historical-sync.service.ts`,
   `channels/telegram-channel-sync.orchestrator.ts`,
   `channels/telegram-invite-sync.service.ts` и
   `channels/telegram-invite-persistence.service.ts`. Сначала разделить
   этапы по DTO и обеспечить bounds, затем добавить coverage/unknown и
   передать их в finalize. Убрать выдачу полного invite URL в предупреждении
   о cutoff без createdAt. Для cancelled/expired historical links сохранять
   immutable identity и последнюю подтверждённую метрику.
3. **OT-04, OT-13 — кампании и экран.**
   `ad-campaign-invite-windows.service.ts`,
   `ad-campaign-admission-analytics.service.ts`,
   `channels/telegram-channel-admission-sync.service.ts`,
   `ad-campaign-list-read.service.ts`,
   `ad-campaign-detail-metrics.ts`,
   `mutual-promotion-boundary.service.ts`,
   `telegram-query-invalidation.ts`, `campaigns-table.tsx` и channel detail.
   Подключить новый статус к подтверждённым baseline. При хранении отдельной
   свежести согласовать Prisma, миграцию, API и web одновременно.
4. **OT-05 — параллельный приоритет для отдельной ветки отмены.**
   `telegram-managed-post-publication.service.ts`,
   `telegram-managed-post-move.service.ts`,
   `telegram-managed-post-history.service.ts`,
   `telegram-managed-post-edit-transport.service.ts` и существующие
   `telegram-managed-post-rescheduler-repair.ts` /
   `telegram-managed-post-native-recovery.store.ts`. Сперва воспроизводим
   accepted-but-disconnected, затем согласуем безопасный transport boundary.
   Не переписывать owner-transfer rescheduler. До любых изменений запустить
   publication/deadline gates, после — повторить их и сценарии удаления/редактирования.
5. **OT-08, OT-09, OT-10, OT-14–16 — граничная QA.**
   По фактическому результату A/B уточнить оставшиеся гипотезы. Для ads/VP
   проверять `telegram-ad-sales.service.ts`, `mutual-promotion-activation.service.ts`
   и `mutual-promotion-lifecycle.service.ts`. Для CRM и ботов — existing
   session factory, runtime manager и `telegram-channel-access.service.ts`.

## Read-only A/B для согласованного канала

1. Зафиксировать deployed SHA и время UTC, один workspace/channel, псевдонимы
   двух акторов, текущий owner/admin/member и capability-флаги. Читать только
   безопасные поля AdminLink, SourceAccess и последнего DataSource. Использовать
   read-only DB-транзакцию либо подтверждённый GET read model. Убрать URL,
   авторизационные заголовки и реальные creator IDs из результатов.
2. Через уже владеющий сессиями transport проверить отдельно old actor,
   new owner и priority publisher, если это третий актор. Сохранить только
   RPC, elapsed/timeout, коды, declared/fetched unique по creator и
   active/revoked, и причину завершения. Сравнить несколько заранее известных
   старых/новых links, идентичные окна и дату UTC. Обозначать отсутствующие
   страницы unknown, ошибок авторизации не считать нулём.
3. Снять из БД последние link snapshots и время подтверждения окон; сравнить
   с прямой channel queue. UI проверить до/после обычного повторного GET и
   по состояниям verified/partial/no access/stale. Refresh, который пишет
   в БД, остается fixture-only в этом расследовании.
4. Для публикаций сравнить агрегаты ordinary / LOCAL / ad / VP / external,
   сохранённые UTC и совпадение с journal/remote evidence. Снимать только
   количества и булевы совпадения, без содержимого сообщений. При
   неоднозначном результате записать блокер и сохранить существующий claim.
   CRM проверить по состоянию соединения и lease, без чтения переписки.
   Реальные экспорт, join, approve, отмена, пересоздание, отправка или
   scheduled recovery не входят в данный A/B.

Нагрузочный результат текущего прохода — ноль нового runtime work. Для
follow-up сохранить on-demand refresh и ограниченные страницы/аккаунты.
100 каналов без действий дают ноль новых TG RPC и DB writes. Одна операция
проверяет выбранный канал и ограниченное количество аккаунтов; один bulk
запуск использует батчирование, без перезапроса каждой detail страницы.
Сохранять только изменившиеся наблюдения, использовать существующую retention,
учесть Neon wakeup при активном чтении и сохранить текущий Railway CPU/RAM/
network baseline в idle. Не добавлять cron, poller или отдельный transport.

## Воспроизведение и результаты

Из корня checkout. Команда запускает все fixtures OT-01–07 и OT-17,
плюс существующие тесты тех же сервисов. Встроенные mock Telegram
clients и Prisma doubles не подключаются к production.

```sh
pnpm --filter api exec jest --runInBand 'telegram-owner-transfer|ad-campaign-invite-windows.service|telegram-user-accounts.service'
```

Новые fixtures находятся в [MTProto и выборе источника](../../../apps/api/src/telegram/shared/mtproto/telegram-owner-transfer-diagnosis.spec.ts),
[отмене native schedule](../../../apps/api/src/domains/telegram/telegram-channels/telegram-owner-transfer-cancellation-diagnosis.spec.ts),
[окнах кампаний](../../../apps/api/src/domains/growth/ad-campaigns/ad-campaign-invite-windows.service.spec.ts)
и [refresh Telegram-аккаунтов](../../../apps/api/src/domains/telegram/telegram-user-accounts/telegram-user-accounts.service.spec.ts).

Итог локальной проверки: 12 новых воспроизведений покрывают восемь
подтверждённых P1. Расширенный API-прогон прошёл 418 тестов в 41 наборе,
четыре PostgreSQL integration tests пропущены. Целевой web-прогон прошёл
26 тестов в четырёх наборах. API typecheck и build прошли. Production-код
в этом проходе не менялся, временные сервисы не запускались.

## Реализация и ограничения follow-up

Эта секция обновляет статус предыдущей диагностической матрицы. Исходные
наблюдения выше описывают воспроизведение до исправления.

| Сценарий | Результат |
| --- | --- |
| OT-17 / OT-06 | Канал с известным ID сопоставляется по ID. Другой peer, найденный по старому username или ссылке, отклоняется. Полный dialog scan согласованно обновляет обе таблицы доступа. Усечённый scan сохраняет неизвестные строки, для них нужна адресная перепроверка. |
| OT-01 / OT-10 | Invite lookup перебирает до трёх связанных MTProto-источников с invite capability. В создании допускается смена автоматически выбранного актёра только после отказа в проверке до ExportChatInvite. Явно выбранный пользователь остаётся закреплённым. Неопределённый ExportChatInvite не повторяется. |
| OT-02 / OT-03 / OT-07 | Недобор или отказ страницы снижает статус каталога. Успешная ветка active/revoked сохраняется отдельно. Периодные importers требуют согласованного count, порядка и cursor. Отказ invite lookup не теряет историю постов, а выключенные в DTO этапы не запрашиваются. |
| OT-04 / OT-13 | Ошибка окна сохраняет последнюю подтверждённую дату и значения. Успех более раннего окна чтения не перезаписывает результат более позднего. Список кампаний отдаёт null для неподтверждённых окон, UI обновляет ключи окна и истории. VP не создаёт фиктивный pending baseline при восстановлении старой записи. |
| OT-05 | Проверяются ID канала, закреплённый sender, уникальность ID в БД, текущая очередь и дата. При неопределённом исходе claim сохраняется. ACK требует явного удаления каждого ID из нужного peer. Telegram также использует этот тип события при отправке из очереди, поэтому наличие sent_messages исключает подтверждение отмены. Подтверждение записывается до перевода статуса. Конкурирующий пользовательский delete не повторяет RPC, удаление сделки потребляет ACK в той же транзакции, а восстановление ревизии блокируется при существующем native schedule или claim. [Контракт Telegram](https://core.telegram.org/constructor/updateDeleteScheduledMessages). |
| OT-11 / OT-12 | Канальная очередь поступает из отдельного RPC, старые значения сохраняются при неизвестном ответе. Отсутствующий профиль автора не заменяется профилем читающего аккаунта. Уже подтверждённая атрибуция того же автора сохраняется. |
| Runtime DDL | Убраны пути исполнения ALTER TABLE для requestedCount из channel analytics, invite persistence и invite snapshot store. Необходимые колонки объявлены в существующих миграциях, применённых только к одноразовой PostgreSQL. |
| Query cache | Channel sync обновляет кеш вариантов автора инвайта только для синхронизированного канала. Campaign refresh обновляет windows, history и список ссылок. |

Оставшаяся область проверки: Telegram-права при передаче реального канала,
видимость старых active/revoked ссылок, точное поведение read models при частично
устаревшем канале и независимые ad/VP и CRM live flows. Last-known значения
имеют timestamp, но отдельный durable статус неудачной попытки окна кампании
пока не хранится. Локальные публикационные тесты проверяют конкурентную
отмену и дедлайны. Они не подтверждают, что отозванный sender сможет
прочитать свою очередь. Общая политика live-проверки capability всех
неинвайтных Telegram действий этим изменением не унифицирована. В частности,
`resetChannelScheduledPosts` по-прежнему действует на очередь целиком через один
источник и не использует per-post ACK. Этот путь, включая внешние ручные записи
и удаление прав закреплённого sender, остаётся открытым. Для неопределённой
отмены требуется разбор подтверждений Telegram перед снятием claim.

**LIVE NOT VERIFIED.** Для проверки без изменений выполнить read-only A/B
из предыдущей секции. На согласованном приватном канале после отдельного
разрешения пользователя проверить по порядку: refresh старого и нового
владельцев в UI, чтение старой ссылки, одно создание новым владельцем,
переход pending после ручного approve, обычный native post и его отмену,
затем отдельные тестовые ad/VP. Сверить канал, UTC, ID, счётчики и ACK.
При неизвестном исходе остановить повторы и сохранить evidence.

Новая работа выполняется только при явных/существующих запросах. Idle
polling, таймеров, процессов и таблиц хранения не добавлено. Invite lookup
пробует максимум три сессии. Успешная отмена добавляет ограниченный read
очереди и claim/ACK writes на один выбранный пост. На 100 каналах в покое
дополнительных обращений нет. Active PostgreSQL и HTTP запросы сохраняют
обычное влияние на Neon sleep и Railway CPU/RAM/сеть.

### Результаты проверки реализации

- Профильный API-прогон прошёл 573 теста в 64 наборах. В прогон вошли
  пять Prisma integration tests с двумя соединениями к одноразовой PostgreSQL,
  в том числе гонка отмены с потерянным ответом. Контейнер остановлен.
- Профильный web-прогон прошёл 23 теста в шести наборах, включая проверку
  обновления источников одного канала и кешей кампании. Сборка API и оба
  typecheck прошли. `git diff --check` прошёл.
- Общий API-прогон зафиксировал ошибки и завершился `SIGSEGV`. Два набора
  затронутых фикстур и тесты удаления сделки повторно прошли в профильном
  прогоне после исправления. Общий web lint завершился со 138 ошибками и
  171 предупреждением. Структурная проверка завершилась с 24 нарушениями.

## Account sync and channel-card freshness

An explicit MTProto account sync refreshes its own dialog inventory and checks
already managed channels against the other connected accounts in the same
workspace. Peer checks run two at a time and skip channel photo downloads.
An incomplete dialog scan leaves missing rows alone. A verified new creator
revokes older creator capabilities for other accounts until their actual roles
can be read. Account-login synchronization keeps its single-account scope.

Channel cards render their persisted response immediately. Opening the list
revalidates that response against the API, and returning focus revalidates a
stale list after one minute. Each refresh reads the existing list in one
request. The existing full channel sync supplies overnight request counts for
enabled channels. There are no new timers, per-channel browser requests,
background Telegram scans, or retained records. A workspace with 100 visible
channels still uses one paginated card request per refresh.

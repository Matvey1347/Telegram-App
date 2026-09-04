import type en from "@/i18n/locales/en/telegram/posts/common";

const messages = {
  "telegram.posts.title": "Публикации Telegram",
  "telegram.posts.subtitle":
    "Создавайте черновики, публикуйте сразу или планируйте публикации в Telegram",
  "telegram.posts.tabs.posts": "Публикации",
  "telegram.posts.tabs.groups": "Группы",
  "telegram.posts.tabs.editor": "Редактор",
  "telegram.posts.tabs.calendar": "Календарь",
  "telegram.posts.channelActions": "Действия с каналом",
  "telegram.posts.newPost": "Новая публикация",
  "telegram.posts.newGroup": "Новая группа",
  "telegram.posts.noChannels": "Нет каналов Telegram с доступом к публикации",
  "telegramPosts.systemGroup.createdInTelegram": "Созданные в Telegram",
  "telegramPosts.systemGroup.advertise": "Реклама",
  "telegramPosts.systemGroup.systemBotPosts": "Публикации системного бота",
  "telegramPosts.status.draft": "Черновик",
  "telegramPosts.status.publishing": "Публикуется",
  "telegramPosts.status.scheduled": "Запланировано",
  "telegramPosts.status.published": "Опубликовано",
  "telegramPosts.status.failed": "Ошибка",
  "telegram.posts.status.synced": "Синхронизировано",
  "telegram.posts.remoteStatus.unknown": "Статус в Telegram неизвестен",
  "telegram.posts.remoteStatus.missing": "Не найдено в Telegram",
  "telegram.posts.remoteStatus.broken": "Ссылка на Telegram не работает",
  "telegram.posts.search": "Поиск по названию, тексту, группе или участнику",
  "telegram.posts.total": "Всего: {count}",
  "telegram.posts.created": "создано {date}",
  "telegram.posts.bulk.waiting": "Ожидаем ответ сервера…",
  "telegram.posts.bulk.completed":
    "Завершено: успешно — {success}, с ошибкой — {failed}, пропущено — {skipped}.",
  "telegram.posts.bulk.published": "Публикация опубликована.",
  "telegram.posts.bulk.scheduled": "Публикация запланирована.",
  "telegram.posts.bulk.moved": "Публикация перемещена.",
  "telegram.posts.bulk.convertedToDraft":
    "Публикация преобразована в черновик.",
  "telegram.posts.bulk.deleted": "Публикация удалена.",
  "telegram.posts.bulk.skipped": "Публикация пропущена.",
  "telegram.posts.bulk.failed":
    "Не удалось выполнить операцию для этой публикации.",
  "telegram.posts.count.posts": "Публикаций: {count}",
  "telegram.posts.error.generic":
    "Не удалось выполнить действие с публикациями Telegram.",
  "telegramPosts.errors.channelNotFound":
    "Этот Telegram-канал больше не существует.",
  "telegramPosts.errors.postNotFound": "Эта публикация больше не существует.",
  "telegramPosts.errors.groupNotFound":
    "Эта группа публикаций больше не существует.",
  "telegramPosts.errors.titleRequired": "Укажите внутреннее название.",
  "telegramPosts.errors.assignedMemberRequired":
    "Назначьте участника рабочего пространства.",
  "telegramPosts.errors.contentRequired":
    "Добавьте текст для Telegram или хотя бы одно изображение.",
  "telegramPosts.errors.invalidSchedule":
    "Укажите корректные дату и время публикации.",
  "telegramPosts.errors.scheduleInPast":
    "Время публикации должно быть в будущем.",
  "telegramPosts.errors.invalidTimezone": "Выбран некорректный часовой пояс.",
  "telegramPosts.errors.alreadyInTargetChannel":
    "Публикация уже находится в выбранном канале.",
  "telegramPosts.errors.groupAlreadyInTargetChannel":
    "Группа уже находится в выбранном канале.",
  "telegramPosts.errors.publishFailed":
    "Telegram не смог опубликовать эту публикацию.",
  "telegramPosts.errors.importRowInvalid":
    "Строка импорта содержит некорректные данные.",
  "telegramPosts.errors.notEditable": "Эту публикацию нельзя изменить.",
  "telegramPosts.errors.notScheduled": "Эта публикация не запланирована.",
  "telegramPosts.errors.batchLimitExceeded":
    "Для одной операции выбрано слишком много публикаций.",
  "telegramPosts.errors.imagesNotEditable":
    "После отправки или планирования изображения изменить нельзя.",
  "telegramPosts.errors.mediaNotReplaceable":
    "Медиа этой публикации нельзя заменить в Telegram.",
  "telegramPosts.errors.publishSourceUnavailable":
    "Подключите аккаунт или бота с правом публикации в этом канале.",
  "telegramPosts.errors.telegramReferenceMissing":
    "Не найдена ссылка на сообщение Telegram.",
  "telegramPosts.errors.plannerRangeInvalid":
    "Указан некорректный период планирования.",
  "telegramPosts.errors.plannerNoAssignments":
    "Планировщик не создал ни одного назначения.",
  "telegramPosts.errors.plannerFormatNotFound":
    "Формат планировщика больше не существует.",
  "telegramPosts.errors.plannerSlotNotFound":
    "Слот планировщика больше не существует.",
  "telegramPosts.errors.calendarRangeInvalid":
    "Выберите корректный диапазон дат календаря.",
  "telegramPosts.errors.calendarRangeTooLarge":
    "Выбранный диапазон календаря слишком большой.",
  "telegramPosts.errors.manualLinkBlocked":
    "К этой публикации нельзя прикрепить ссылку Telegram.",
  "telegramPosts.errors.linkInvalid":
    "Введите корректную ссылку на публикацию Telegram.",
  "telegramPosts.errors.linkChannelMismatch":
    "Эта ссылка Telegram относится к другому каналу.",
  "telegramPosts.errors.mediaUrlInvalid": "Некорректная ссылка на изображение.",
  "telegramPosts.errors.mediaEmpty": "Изображение пустое.",
  "telegramPosts.errors.mediaTooLarge": "Изображение слишком большое.",
  "telegramPosts.errors.mediaInvalid":
    "Telegram не удалось обработать изображение.",
  "telegram.posts.support.addPosts": "Добавить публикации",
  "telegram.posts.support.planPreview": "Предпросмотр плана",
  "telegram.posts.support.selectedPosts": "Выбранные публикации",
  "telegram.posts.support.availableTimes": "Доступное время",
  "telegram.posts.support.openTimes": "Свободное время",
  "telegram.posts.support.openNewTab": "Открыть публикацию в новой вкладке",
  "telegram.posts.support.importJsonPlan": "Импортировать JSON-план",
  "telegram.posts.support.plannerDownloaded":
    "Инструкция для GPT-планировщика скачана.",
  "telegram.posts.support.plannerDownloadError":
    "Не удалось скачать инструкцию для GPT-планировщика.",
  "telegram.posts.support.loadingDeletion": "Загружаем предпросмотр удаления",
  "telegram.posts.support.deletionPromptCopied":
    "Инструкция по удалению скопирована.",
  "telegram.posts.support.deletionPromptCopyError":
    "Не удалось скопировать инструкцию по удалению.",
  "telegram.posts.support.channelImport": "Импорт канала",
  "telegram.posts.support.excludeDeletion": "Исключить из удаления",
  "telegram.posts.support.noPostsSelected": "Публикации не выбраны.",
  "telegram.posts.support.noGroupsSelected": "Группы не выбраны.",
  "telegram.posts.support.contextDownloaded": "Контекст скачан.",
  "telegram.posts.support.context": "Контекст",
  "telegram.posts.support.downloadingContext": "Скачиваем контекст",
  "telegram.posts.support.downloadTxt": "Скачать выбранное в TXT",
  "telegram.posts.support.downloadPostsTxt":
    "Скачать выбранные публикации в TXT",
  "telegram.posts.support.history": "История публикации",
  "telegram.posts.support.historyError": "Не удалось загрузить историю.",
  "telegram.posts.support.synced": "Синхронизировано из Telegram",
  "telegram.posts.support.loadingGroups": "Загружаем группы публикаций",
  "telegram.posts.support.fileReadError": "Не удалось прочитать файл.",
  "telegram.posts.support.importGroups": "Импорт групп",
  "telegram.posts.support.promptCopied": "Инструкция скопирована.",
  "telegram.posts.support.returnDrafts": "Вернуть всё в черновики",
  "telegram.posts.support.returnDraftsDescription":
    "Все сообщения, запланированные в этом Telegram-канале, будут удалены безвозвратно. Запланированные публикации в Telegram System станут чистыми черновиками и потеряют ID и ссылки сообщений Telegram. Опубликованные сообщения не изменятся.",
  "telegram.posts.support.noPostsAvailable":
    "Нет публикаций, которые можно добавить.",
  "telegram.posts.support.addSelected": "Добавить выбранные",
  "telegram.posts.support.planNotScheduled":
    "Ничего не будет запланировано, пока вы не подтвердите весь план.",
  "telegram.posts.support.postsCount": "Публикаций: {count}",
  "telegram.posts.support.rerollDay": "Пересобрать день",
  "telegram.posts.support.openNamed": "Открыть «{title}» в новой вкладке",
  "telegram.posts.support.removeNamed": "Убрать «{title}» из плана",
  "telegram.posts.support.noMatchingDrafts":
    "Для доступного времени не найдено подходящих черновиков.",
  "telegram.posts.support.scheduleAll": "Запланировать публикации: {count}",
  "telegram.posts.support.planUploadHint":
    "Загрузите или вставьте postId с scheduledAt либо датой и временем.",
  "telegram.posts.support.planInstructionHint":
    "Инструкция для GPT включает постоянное время канала, тексты публикаций, ограничения публикации, занятые слоты и недавнюю историю.",
  "telegram.posts.support.preparingInstruction": "Готовим инструкцию…",
  "telegram.posts.support.downloadInstruction": "Скачать инструкцию для GPT",
  "telegram.posts.support.downloadingContextLabel": "Скачиваем контекст…",
  "telegram.posts.support.historyDescription":
    "Здесь видно, кто и что сделал с публикацией. Копии для восстановления хранятся 7 дней.",
  "telegram.posts.support.loadingHistory": "Загружаем историю…",
  "telegram.posts.support.restore": "Восстановить",
  "telegram.posts.support.noBackups":
    "Для этой публикации пока нет записанных действий.",
  "telegram.posts.history.systemActor": "Система",
  "telegram.posts.history.activity.created": "{name} создал(а) публикацию",
  "telegram.posts.history.activity.updated": "{name} обновил(а) публикацию",
  "telegram.posts.history.activity.published":
    "{name} опубликовал(а) публикацию",
  "telegram.posts.history.activity.scheduled":
    "{name} запланировал(а) публикацию",
  "telegram.posts.history.activity.linkChanged":
    "{name} изменил(а) ссылку Telegram",
  "telegram.posts.history.activity.restored":
    "{name} восстановил(а) публикацию",
  "telegram.posts.history.activity.deleted": "{name} удалил(а) публикацию",
  "telegram.posts.history.activity.returnedToDraft":
    "{name} вернул(а) публикацию в черновики",
  "telegram.posts.history.activity.moved": "{name} переместил(а) публикацию",
  "telegram.posts.history.activity.synchronized":
    "{name} синхронизировал(а) публикацию с Telegram",
  "telegram.posts.history.activity.changed": "{name} изменил(а) публикацию",
  "telegram.posts.support.readOnlyDescription":
    "«{title}» — публикация Telegram только для чтения. Содержимое и статистика обновляются из аналитики канала; здесь её нельзя изменить, запланировать, переместить, переупорядочить или удалить.",
  "telegram.posts.support.openOriginal":
    "Открыть исходную публикацию в Telegram",
  "telegram.posts.support.returning": "Возвращаем…",
  "telegram.posts.support.resetResult":
    "Удалено запланированных сообщений Telegram: {deleted}; возвращено публикаций в черновики: {returned}.",
  "telegram.posts.support.resetEmpty":
    "Запланированные сообщения Telegram и системные публикации не найдены.",
  "telegram.posts.support.resetError":
    "Не удалось вернуть запланированные публикации в черновики",
  "telegram.posts.search.label": "Поиск публикаций",
  "telegram.posts.search.placeholder":
    "Поиск по названию, тексту, группе или участнику",
  "telegram.posts.icon.addEmoji": "Добавить эмодзи",
  "telegram.posts.icon.addIcon": "Добавить значок",
  "telegram.posts.time.pickIcon": "Выбрать значок",
  "telegram.posts.time.title": "Название",
  "telegram.posts.time.optionalLabel": "Необязательная подпись",
  "telegram.posts.time.time": "Время",
  "telegram.posts.time.remove": "Удалить время публикации",
  "telegram.posts.time.menu": "Время публикаций",
  "telegram.posts.time.manageTitle": "Время публикаций",
  "telegram.posts.time.description":
    "Сохранённое время можно выбрать при планировании публикации или заполнении календаря.",
  "telegram.posts.time.empty":
    "Время публикаций ещё не добавлено. Добавьте первый повторно используемый слот.",
  "telegram.posts.time.add": "Добавить время",
  "telegram.posts.time.addNew": "Добавить новое время",
  "telegram.posts.time.addTitle": "Добавить время публикации",
  "telegram.posts.time.addAccessible": "Добавить новое время публикации",
  "telegram.posts.time.save": "Сохранить время",
  "telegram.posts.time.saved": "Время публикаций сохранено.",
  "telegram.posts.time.added": "Время публикации добавлено.",
  "telegram.posts.time.saveError": "Не удалось сохранить время публикаций.",
  "telegram.posts.time.addError": "Не удалось добавить время публикации.",
  "telegram.posts.channels.all": "Все каналы",
  "telegram.posts.channels.selected": "Выбрано: {count}",
  "telegram.posts.channels.emptyMeansAll":
    "Пустой выбор означает видимость во всех каналах",
  "telegram.posts.channels.selectAll": "Выбрать все",
  "telegram.posts.links.repairTitle":
    "Связанные публикации будут восстановлены перед отправкой",
  "telegram.posts.links.blockedTitle":
    "Связанные публикации блокируют отправку",
  "telegram.posts.links.readyTitle": "Связанные внутренние публикации готовы",
  "telegram.posts.links.repairDescription":
    "Эту серию уже можно запланировать. Ссылки останутся неактивными, пока каждая предыдущая публикация не будет опубликована и проверена:",
  "telegram.posts.links.blockedDescription":
    "Сначала опубликуйте эти записи или добавьте для них ссылки Telegram:",
  "telegram.posts.links.readyDescription":
    "Все связанные публикации уже готовы к отправке.",
  "telegram.posts.links.pending": "Ожидают проверки",
  "telegram.posts.links.blocking": "Блокируют",
  "telegram.posts.links.ready": "Готовы",
  "telegram.posts.links.broken": "ссылка повреждена",
  "telegram.posts.links.missingNamed": "Публикация {id} не найдена",
  "telegram.posts.links.jumpHint":
    "Нажмите, чтобы перейти к этой ссылке в тексте.",
  "telegram.posts.links.newTabHint":
    "Cmd/Ctrl-нажатие откроет её в новой вкладке.",
  "telegram.posts.history.beforeEdit": "Перед редактированием",
  "telegram.posts.history.beforePublish": "Перед публикацией",
  "telegram.posts.history.beforeSchedule": "Перед планированием",
  "telegram.posts.history.beforeManualLink": "Перед добавлением ссылки вручную",
  "telegram.posts.history.beforeSyncMissing":
    "Перед синхронизацией: отсутствует в Telegram",
  "telegram.posts.history.beforeSyncBroken":
    "Перед синхронизацией: повреждённая публикация Telegram",
  "telegram.posts.history.beforeSyncPublished":
    "Перед синхронизацией: опубликовано раньше времени",
  "telegram.posts.history.beforeSyncUpdate": "Перед обновлением синхронизации",
  "telegram.posts.history.beforeRestore": "Перед восстановлением",
  "telegram.posts.history.beforeDelete": "Перед удалением",
  "telegram.posts.history.change": "Изменение",
  "telegram.posts.history.createdAt": "Резервная копия создана {date}",
  "telegram.posts.telegramLink.notFound": "Публикация не найдена в Telegram",
  "telegram.posts.telegramLink.idMismatch":
    "Идентификатор Telegram не совпадает",
  "telegram.posts.telegramLink.notVerified":
    "Идентификатор Telegram не проверен",
  "telegram.posts.telegramLink.verifiedDescription":
    "Ссылка соответствует опубликованной записи, найденной в Telegram.",
  "telegram.posts.telegramLink.mismatchDescription":
    "Ссылка Telegram задана вручную и не совпадает с найденной публикацией. Ссылка сохранена.",
  "telegram.posts.telegramLink.missingDescription":
    "Telegram не нашёл опубликованное сообщение для этой записи. Сохранённая ссылка не изменена.",
  "telegram.posts.telegramLink.manualDescription":
    "Ссылка Telegram, заданная вручную, ещё не проверена.",
  "telegram.posts.telegramLink.unverifiedDescription":
    "Telegram ещё не подтвердил опубликованный идентификатор этой записи.",
  "telegram.posts.telegramLink.scheduledSystem": "Запланировано через Nexeloq",
  "telegram.posts.telegramLink.scheduledTelegram": "Запланировано в Telegram",
  "telegram.posts.telegramLink.systemScheduleDescription":
    "Telegram System опубликует запись в назначенное время. Сейчас её нет в запланированных сообщениях Telegram.",
  "telegram.posts.telegramLink.scheduleDescription":
    "Ссылка Telegram появится после публикации и проверки.",
  "telegram.posts.telegramLink.saved":
    "Ссылка на публикацию Telegram сохранена. Проверьте её в Telegram для подтверждения идентификатора.",
  "telegram.posts.telegramLink.removed":
    "Ссылка Telegram удалена. Публикация возвращена в черновики.",
  "telegram.posts.telegramLink.saveError":
    "Не удалось сохранить ссылку на публикацию Telegram.",
  "telegram.posts.telegramLink.verified":
    "Идентификатор публикации Telegram подтверждён.",
  "telegram.posts.telegramLink.verifyError":
    "Не удалось проверить идентификатор публикации Telegram.",
  "telegram.posts.telegramLink.open": "Открыть в Telegram",
  "telegram.posts.telegramLink.viewSchedule":
    "Посмотреть состояние запланированной публикации Telegram",
  "telegram.posts.telegramLink.setOrVerify":
    "Задать или проверить ссылку Telegram",
  "telegram.posts.telegramLink.deliveryTitle":
    "Состояние запланированной доставки",
  "telegram.posts.telegramLink.scheduleTitle":
    "Состояние запланированной публикации Telegram",
  "telegram.posts.telegramLink.linkTitle": "Ссылка на публикацию Telegram",
  "telegram.posts.telegramLink.setTitle": "Задать ссылку Telegram",
  "telegram.posts.telegramLink.scheduleError":
    "Telegram не подтвердил запланированную публикацию. Идентификатор запланированного сообщения не является публичной ссылкой; обновите или синхронизируйте канал до публикации.",
  "telegram.posts.telegramLink.pasteHint":
    "Вставьте ссылку на опубликованную запись Telegram. Если при проверке обнаружится несовпадение или запись не найдётся, ссылка сохранится.",
  "telegram.posts.telegramLink.saveBeforeCheck":
    "Сохраните ссылку перед проверкой идентификатора Telegram.",
  "telegram.posts.telegramLink.checking": "Проверяем…",
  "telegram.posts.telegramLink.check": "Проверить идентификатор Telegram",
  "telegram.posts.telegramLink.save": "Сохранить ссылку",
  "telegram.posts.telegramLink.remove": "Удалить ссылку",
} as const satisfies Record<keyof typeof en, string>;

export default messages;

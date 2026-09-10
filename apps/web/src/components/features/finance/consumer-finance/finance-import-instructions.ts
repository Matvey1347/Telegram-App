import type { FinanceLocale } from "./i18n/core";

export const financeImportTemplate = `{
  "format": "telegram-system.consumer-finance",
  "version": 1,
  "mode": "ADD",
  "settings": {
    "defaultCurrency": "UAH",
    "timezone": "Europe/Kyiv",
    "locale": "uk",
    "displayName": "Alex"
  },
  "data": {
    "accounts": [
      { "ref": "cash-uah", "name": "Cash", "type": "CASH", "currency": "UAH", "openingBalance": "1000" }
    ],
    "categories": [
      { "ref": "food", "name": "Food", "emoji": "🍽️", "type": "EXPENSE" },
      { "ref": "coffee", "parentRef": "food", "name": "Coffee", "emoji": "☕", "type": "EXPENSE" }
    ],
    "transactions": [
      { "ref": "tx-1", "accountRef": "cash-uah", "categoryRef": "coffee", "type": "EXPENSE", "amount": "85.50", "occurredAt": "2026-09-08T09:30:00.000Z", "description": "Coffee" }
    ],
    "transfers": [],
    "limits": [
      { "ref": "food-month", "categoryRef": "food", "amount": "8000", "currency": "UAH" }
    ],
    "reminders": [],
    "debts": [],
    "regularPayments": [],
    "savingsGoals": [],
    "savingsMovements": [],
    "investments": [],
    "investmentCashFlows": [],
    "investmentValuations": []
  }
}`;

const details: Record<FinanceLocale, string> = {
  en: `

GENERAL RULES
• File: one UTF-8 JSON document, up to 10 MB and 5,000 rows total including transaction items; one transaction may contain up to 100 items.
• A file downloaded with “Export data” already uses this format and can be uploaded directly.
• format, version and mode must exactly match the template. Version 1 supports only mode "ADD": existing records are never deleted. Provided settings update profile settings; existing system categories are reused and existing monthly budgets are kept unchanged.
• Every object needs a unique ref within its section. A ref is your local identifier (for example "cash-uah"), not a database ID.
• Relations use ...Ref fields and must point to ref values included in this same file. Import referenced accounts/categories/goals/investments before using their refs conceptually; physical JSON order does not matter.
• Amounts are strings with a decimal point: "1250.50". Do not add spaces, commas or currency symbols. Opening balance may be negative; other amounts must be positive, while a valuation may be zero.
• Currency is a three-letter uppercase code such as UAH, USD, EUR or PLN.
• Date/time values are ISO-8601, preferably UTC: "2026-09-08T09:30:00.000Z". Timezones use IANA names such as "Europe/Kyiv".
• Empty sections may be [] or omitted. Field names are case-sensitive. Unknown fields and invalid enum values are rejected.
• The server validates the entire file first, prepares historical currency rates, and writes everything in one database transaction. One invalid row rolls back the whole import.
• Uploading the exact same JSON document again is detected and does not create duplicates. A changed document is treated as a new ADD import.
• During upload the window shows streamed validation, rate preparation and per-section write progress. You may cancel while the request is active.
• Analytics and balances are recalculated from imported records. Billing/subscriptions, bot or AI credentials, Telegram identity, pending proposals, chat/runtime state, learned merchant rules and delivery history are intentionally not portable.

SECTIONS AND FIELDS
settings — optional profile settings: defaultCurrency, timezone, locale (uk | ru | en), displayName (up to 120 characters).
accounts — accounts. Required: ref, name, type (CASH | CARD | SAVINGS | OTHER), currency. Optional: emoji (Unicode/custom emoji or an existing immutable image source), openingBalance, archivedAt.
categories — category tree. Required: ref, name, type (INCOME | EXPENSE). Optional: parentRef, emoji (Unicode/custom emoji or an existing immutable image source), key, archivedAt. Parent and child must have the same type.
transactions — income/expenses. Required: ref, accountRef, type, amount, occurredAt. Optional: categoryRef, description, merchantDisplay, items[]. Type must match the category. Each item requires displayName and totalAmount; quantity, unitPrice, categoryRef and free-form metadata are optional.
transfers — between two accounts. Required: ref, fromAccountRef, toAccountRef, fromAmount, toAmount, occurredAt. Accounts must differ. Optional: description.
limits — monthly budgets. Required: ref, categoryRef pointing to an EXPENSE category, amount, currency.
reminders — monthly reminders. Required: ref, name, amount, currency, dayOfMonth (1–31), nextOccurrenceAt. Optional: reminderOffsetMinutes (non-negative integer), enabled.
debts — debts. Required: ref, accountRef, direction (I_OWE | OWED_TO_ME), name, amount, dueAt, scheduleTimezone. Optional: status (OPEN | SETTLED), note. SETTLED also requires settledAt and settlementTransactionRef to a matching imported transaction.
regularPayments — recurring payments. Required: ref, accountRef, name, amount, recurrence (WEEKLY | MONTHLY | YEARLY), nextOccurrenceAt, scheduleTimezone. Optional: categoryRef pointing to EXPENSE, status (ACTIVE | PAUSED | CANCELED), note.
savingsGoals — goals. Required: ref, name, targetAmount, currency. Optional: initialAmount for money saved before the imported movement history, targetDate, note, status (ACTIVE | COMPLETED | ARCHIVED).
savingsMovements — allocations. Required: ref, accountRef, kind, amount, occurredAt. ALLOCATE needs toGoalRef; RELEASE needs fromGoalRef; REALLOCATE needs two different goal refs. Goal/account currencies must match; at every point in chronological order, the linked movement balance must stay non-negative. initialAmount is preserved separately and cannot fund a RELEASE row. Optional: linkedTransferRef, note.
investments — investments. Required: ref, name, type, currency, startedAt. type: BUSINESS | REAL_ESTATE | SECURITIES | CRYPTO | DIGITAL_ASSET | PHYSICAL_ASSET | OTHER. Optional: description, status (ACTIVE | CLOSED | ARCHIVED), closedAt.
investmentCashFlows — contributed/returned money. Required: ref, investmentRef, accountRef, kind (CONTRIBUTION | RETURN), amount, occurredAt. Optional: note.
investmentValuations — value history. Required: ref, investmentRef, value, valuedAt. Optional: correctsRef pointing to an earlier valuation of the same investment, createdAt (ISO-8601 tie-break timestamp), note. One valuation can only be corrected once.

EXAMPLE
`,
  uk: `

ЗАГАЛЬНІ ПРАВИЛА
• Файл: один JSON-документ у UTF-8, до 10 МБ і 5 000 записів загалом разом із позиціями транзакцій; в одній транзакції може бути до 100 позицій.
• Файл, завантажений кнопкою «Експортувати дані», уже має цей формат і готовий до імпорту.
• format, version і mode мають точно збігатися із шаблоном. Версія 1 підтримує лише mode "ADD": наявні записи не видаляються. Передані settings оновлюють налаштування профілю; системні категорії використовуються повторно, а наявні місячні бюджети не змінюються.
• Кожен об’єкт має унікальний ref у межах свого розділу. Це ваш локальний ідентифікатор (наприклад "cash-uah"), а не ID з бази даних.
• Зв’язки задаються полями ...Ref і посилаються на ref із цього самого файлу. Порядок об’єктів у JSON не має значення.
• Суми передавайте рядками з крапкою: "1250.50", без пробілів, ком і символів валют. openingBalance може бути від’ємним; інші суми мають бути додатними, а оцінка інвестиції може дорівнювати нулю.
• Валюта — три великі літери: UAH, USD, EUR, PLN тощо.
• Дата й час — ISO-8601, бажано UTC: "2026-09-08T09:30:00.000Z". Часовий пояс — IANA, наприклад "Europe/Kyiv".
• Порожні розділи можна передати як [] або пропустити. Регістр назв полів важливий. Невідомі поля та некоректні enum-значення відхиляються.
• Сервер спочатку перевіряє весь файл, готує історичні курси валют і лише потім записує все однією транзакцією. Помилка в одному рядку скасовує весь імпорт.
• Повторне завантаження точно такого самого JSON розпізнається й не дублює дані. Змінений документ вважається новим ADD-імпортом.
• У вікні в реальному часі показуються етапи перевірки, підготовки курсів і запису кожного розділу. Активний імпорт можна скасувати.
• Аналітика й баланси перераховуються з імпортованих записів. Білінг/підписки, облікові дані бота чи AI, Telegram-ідентичність, чернетки пропозицій, стан чатів і runtime, вивчені правила мерчантів та історія доставки навмисно не переносяться.

РОЗДІЛИ ТА ПОЛЯ
settings — необов’язкові налаштування профілю: defaultCurrency, timezone, locale (uk | ru | en), displayName (до 120 символів).
accounts — рахунки. Обов’язкові: ref, name, type (CASH | CARD | SAVINGS | OTHER), currency. Необов’язкові: emoji (Unicode/custom emoji або наявне незмінне джерело зображення), openingBalance, archivedAt.
categories — дерево категорій. Обов’язкові: ref, name, type (INCOME | EXPENSE). Необов’язкові: parentRef, emoji (Unicode/custom emoji або наявне незмінне джерело зображення), key, archivedAt. Тип батьківської та дочірньої категорії має збігатися.
transactions — доходи й витрати. Обов’язкові: ref, accountRef, type, amount, occurredAt. Необов’язкові: categoryRef, description, merchantDisplay, items[]. Тип операції має збігатися з типом категорії. Для позиції items потрібні displayName і totalAmount; quantity, unitPrice, categoryRef та довільний metadata — необов’язкові.
transfers — перекази між рахунками. Обов’язкові: ref, fromAccountRef, toAccountRef, fromAmount, toAmount, occurredAt. Рахунки мають відрізнятися. Необов’язкове: description.
limits — місячні бюджети. Обов’язкові: ref, categoryRef на EXPENSE-категорію, amount, currency.
reminders — щомісячні нагадування. Обов’язкові: ref, name, amount, currency, dayOfMonth (1–31), nextOccurrenceAt. Необов’язкові: reminderOffsetMinutes (ціле число ≥ 0), enabled.
debts — борги. Обов’язкові: ref, accountRef, direction (I_OWE | OWED_TO_ME), name, amount, dueAt, scheduleTimezone. Необов’язкові: status (OPEN | SETTLED), note. Для SETTLED також потрібні settledAt і settlementTransactionRef на відповідну імпортовану транзакцію.
regularPayments — регулярні платежі. Обов’язкові: ref, accountRef, name, amount, recurrence (WEEKLY | MONTHLY | YEARLY), nextOccurrenceAt, scheduleTimezone. Необов’язкові: categoryRef на EXPENSE-категорію, status (ACTIVE | PAUSED | CANCELED), note.
savingsGoals — цілі заощаджень. Обов’язкові: ref, name, targetAmount, currency. Необов’язкові: initialAmount для суми, накопиченої до імпортованої історії рухів, targetDate, note, status (ACTIVE | COMPLETED | ARCHIVED).
savingsMovements — розподіл заощаджень. Обов’язкові: ref, accountRef, kind, amount, occurredAt. ALLOCATE потребує toGoalRef; RELEASE — fromGoalRef; REALLOCATE — дві різні цілі. Валюти цілі й рахунку мають збігатися; у кожний момент за хронологією баланс пов’язаних рухів не може бути від’ємним. initialAmount зберігається окремо й не може фінансувати рядок RELEASE. Необов’язкові: linkedTransferRef, note.
investments — інвестиції. Обов’язкові: ref, name, type, currency, startedAt. type: BUSINESS | REAL_ESTATE | SECURITIES | CRYPTO | DIGITAL_ASSET | PHYSICAL_ASSET | OTHER. Необов’язкові: description, status (ACTIVE | CLOSED | ARCHIVED), closedAt.
investmentCashFlows — внесення/повернення коштів. Обов’язкові: ref, investmentRef, accountRef, kind (CONTRIBUTION | RETURN), amount, occurredAt. Необов’язкове: note.
investmentValuations — історія вартості. Обов’язкові: ref, investmentRef, value, valuedAt. Необов’язкові: correctsRef на попередню оцінку тієї самої інвестиції, createdAt (ISO-8601 для визначення порядку за однакової дати), note. Одну оцінку можна виправити лише один раз.

ПРИКЛАД
`,
  ru: `

ОБЩИЕ ПРАВИЛА
• Файл: один JSON-документ в UTF-8, до 10 МБ и 5 000 записей всего вместе с позициями транзакций; в одной транзакции может быть до 100 позиций.
• Файл, скачанный кнопкой «Экспортировать данные», уже имеет этот формат и готов к импорту.
• format, version и mode должны точно совпадать с шаблоном. Версия 1 поддерживает только mode "ADD": существующие записи не удаляются. Переданные settings обновляют настройки профиля; системные категории используются повторно, а существующие месячные бюджеты не изменяются.
• У каждого объекта должен быть уникальный ref внутри его раздела. Это ваш локальный идентификатор (например "cash-uah"), а не ID из базы данных.
• Связи задаются полями ...Ref и указывают на ref из этого же файла. Фактический порядок объектов в JSON значения не имеет.
• Суммы передаются строками с точкой: "1250.50", без пробелов, запятых и символов валют. openingBalance может быть отрицательным; остальные суммы должны быть положительными, а оценка инвестиции может быть нулевой.
• Валюта — три заглавные буквы: UAH, USD, EUR, PLN и т. д.
• Дата и время — ISO-8601, желательно UTC: "2026-09-08T09:30:00.000Z". Часовой пояс — IANA, например "Europe/Kyiv".
• Пустой раздел можно передать как [] или не передавать. Регистр в названиях полей важен. Неизвестные поля и неверные enum-значения отклоняются.
• Сервер сначала проверяет весь файл, подготавливает исторические курсы валют и только затем записывает всё одной транзакцией. Ошибка в одной строке отменяет весь импорт.
• Повторная загрузка точно такого же JSON распознаётся и не создаёт дубликаты. Изменённый документ считается новым ADD-импортом.
• В окне в реальном времени показываются проверка, подготовка курсов и запись каждого раздела. Активный импорт можно отменить.
• Аналитика и балансы пересчитываются из импортированных записей. Биллинг/подписки, учётные данные бота или AI, Telegram-идентичность, черновики предложений, состояние чатов и runtime, изученные правила мерчантов и история доставки намеренно не переносятся.

РАЗДЕЛЫ И ПОЛЯ
settings — необязательные настройки профиля: defaultCurrency, timezone, locale (uk | ru | en), displayName (до 120 символов).
accounts — счета. Обязательные: ref, name, type (CASH | CARD | SAVINGS | OTHER), currency. Необязательные: emoji (Unicode/custom emoji или существующий неизменяемый источник изображения), openingBalance, archivedAt.
categories — дерево категорий. Обязательные: ref, name, type (INCOME | EXPENSE). Необязательные: parentRef, emoji (Unicode/custom emoji или существующий неизменяемый источник изображения), key, archivedAt. Тип родительской и дочерней категории должен совпадать.
transactions — доходы и расходы. Обязательные: ref, accountRef, type, amount, occurredAt. Необязательные: categoryRef, description, merchantDisplay, items[]. Тип операции должен совпадать с типом категории. Для позиции items нужны displayName и totalAmount; quantity, unitPrice, categoryRef и произвольный metadata необязательны.
transfers — переводы между счетами. Обязательные: ref, fromAccountRef, toAccountRef, fromAmount, toAmount, occurredAt. Счета должны различаться. Необязательное: description.
limits — месячные бюджеты. Обязательные: ref, categoryRef на EXPENSE-категорию, amount, currency.
reminders — ежемесячные напоминания. Обязательные: ref, name, amount, currency, dayOfMonth (1–31), nextOccurrenceAt. Необязательные: reminderOffsetMinutes (целое число ≥ 0), enabled.
debts — долги. Обязательные: ref, accountRef, direction (I_OWE | OWED_TO_ME), name, amount, dueAt, scheduleTimezone. Необязательные: status (OPEN | SETTLED), note. Для SETTLED также нужны settledAt и settlementTransactionRef на соответствующую импортированную транзакцию.
regularPayments — регулярные платежи. Обязательные: ref, accountRef, name, amount, recurrence (WEEKLY | MONTHLY | YEARLY), nextOccurrenceAt, scheduleTimezone. Необязательные: categoryRef на EXPENSE-категорию, status (ACTIVE | PAUSED | CANCELED), note.
savingsGoals — цели накоплений. Обязательные: ref, name, targetAmount, currency. Необязательные: initialAmount для суммы, накопленной до импортируемой истории движений, targetDate, note, status (ACTIVE | COMPLETED | ARCHIVED).
savingsMovements — распределение накоплений. Обязательные: ref, accountRef, kind, amount, occurredAt. ALLOCATE требует toGoalRef; RELEASE — fromGoalRef; REALLOCATE требует две разные цели. Валюты цели и счёта должны совпадать; в каждый момент по хронологии баланс связанных движений не может быть отрицательным. initialAmount сохраняется отдельно и не может финансировать строку RELEASE. Необязательные: linkedTransferRef, note.
investments — инвестиции. Обязательные: ref, name, type, currency, startedAt. type: BUSINESS | REAL_ESTATE | SECURITIES | CRYPTO | DIGITAL_ASSET | PHYSICAL_ASSET | OTHER. Необязательные: description, status (ACTIVE | CLOSED | ARCHIVED), closedAt.
investmentCashFlows — вложенные/возвращённые средства. Обязательные: ref, investmentRef, accountRef, kind (CONTRIBUTION | RETURN), amount, occurredAt. Необязательное: note.
investmentValuations — история стоимости. Обязательные: ref, investmentRef, value, valuedAt. Необязательные: correctsRef на предыдущую оценку той же инвестиции, createdAt (ISO-8601 для определения порядка при одинаковой дате), note. Одну оценку можно исправить только один раз.

ПРИМЕР
`,
};

const intro: Record<FinanceLocale, string> = {
  en: `FINANCE DATA IMPORT — FORMAT VERSION 1

Prepare one JSON file. You may include any combination of sections, but every referenced account/category/goal/investment must also be present in the same file.`,
  uk: `ІМПОРТ ДАНИХ FINANCE — ФОРМАТ ВЕРСІЇ 1

Підготуйте один JSON-файл. Можна передати будь-яке поєднання розділів, але кожен рахунок, категорія, ціль або інвестиція, на яку є посилання, також має бути в цьому файлі.`,
  ru: `ИМПОРТ ДАННЫХ FINANCE — ФОРМАТ ВЕРСИИ 1

Подготовьте один JSON-файл. Можно передать любое сочетание разделов, но каждый счёт, категория, цель или инвестиция, на которую есть ссылка, также должны присутствовать в этом файле.`,
};

export function financeImportInstructions(locale: FinanceLocale) {
  return `${intro[locale]}${details[locale]}${financeImportTemplate}`;
}

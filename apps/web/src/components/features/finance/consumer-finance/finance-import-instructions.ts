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
• format and version must exactly match the template. mode is "ADD" (keep current records) or "REPLACE" (atomically delete the current ledger/planning data and load only this file). The switch in the import window overrides the file mode. Profile identity, access and paid plan are never replaced.
• Every object needs a unique ref within its section. A ref is your local identifier (for example "cash-uah"), not a database ID.
• Relations use ...Ref fields and must point to ref values included in this same file. Import referenced accounts/categories/goals/investments before using their refs conceptually; physical JSON order does not matter.
• Amounts are strings with a decimal point: "1250.50". Do not add spaces, commas or currency symbols. Opening balance may be negative; other amounts must be positive, while a valuation may be zero.
• Currency is a three-letter uppercase code such as UAH, USD, EUR or PLN.
• Date/time values are ISO-8601, preferably UTC: "2026-09-08T09:30:00.000Z". Timezones use IANA names such as "Europe/Kyiv".
• Empty sections may be [] or omitted. Field names are case-sensitive. Unknown fields and invalid enum values are rejected.
• The server validates the entire file first, prepares historical currency rates, and writes everything in one database transaction. One invalid row rolls back the whole import.
• In ADD mode, uploading the exact same JSON document again is detected and does not create duplicates. REPLACE always makes the current data match the uploaded file.
• During upload the window shows streamed validation, rate preparation and per-section write progress. You may cancel while the request is active.
• Analytics and balances are recalculated from imported records. Billing plan, bot or AI credentials and Telegram identity are intentionally not portable.

MIGRATION STRATEGY — DO NOT COPY LEGACY CATEGORIES BLINDLY
1. Inventory the source first: accounts and their currencies/balances, transactions, transfers between own accounts, recurring commitments, debts, savings, investments and budgets. Choose one cutoff date and preserve original timestamps.
2. Create accounts for real places where spendable money is held. openingBalance is the balance immediately before the first imported operation, not today's balance. After conversion, replay the file and verify each final account balance against the source.
3. Convert movements between the user's own accounts to transfers, never to income plus expense. Currency exchange between own accounts is also one transfer with fromAmount and toAmount.
4. A positive cash movement is not automatically income. Refunds and money returned to you use REIMBURSEMENT; money received to pay on somebody else's behalf uses PASS_THROUGH; paying back money you owe uses an EXPENSE with DEBT_REPAYMENT. These purposes have economicAmount "0". Ordinary salary/sales use ORDINARY and economicAmount equal to the user's real income.
5. For a shared purchase, transaction amount is the full card/cash charge, purpose is ORDINARY, economicAmount is only the user's share, and every unpaid participant is an OWED_TO_ME debt. When someone pays back later, import that income transaction as REIMBURSEMENT with economicAmount "0" and use it as settlementTransactionRef for the settled debt.
6. Do not leave subscriptions or repeating bills only in a “Subscriptions” category. Keep historical charges as transactions and create regularPayments for the future schedule. Set necessity REQUIRED, DISCRETIONARY or UNSPECIFIED so analytics can separate essential and optional spending.
7. Convert money owed by/to the user to debts. A settled debt needs its real settlement transaction; that transaction changes the account balance but must not inflate income or expense.
8. Convert investment positions to investments, deposits/withdrawals to investmentCashFlows, and known market/business values to investmentValuations. Never import an investment contribution as ordinary expense or its return as ordinary income.
9. Convert savings envelopes/goals to savingsGoals and allocation history to savingsMovements. These movements reserve existing money and do not create income or expense.
10. Convert category budgets to limits. Use reminders only for notifications that are not repeating payments. Build a useful parent/child category tree instead of preserving accidental source-app folders.
11. Avoid double counting: one real event must have one cash movement. Do not also create ordinary income/expense for a transfer, investment cash flow, savings allocation or zero-economic settlement.
12. Before upload validate: refs resolve, account currencies match operation currencies, amounts use decimal strings, timestamps/timezones are explicit, final balances reconcile, and income/expense totals include only the user's economic share.

PROMPT FOR CONVERTING ANY SOURCE WITH AI
“Convert the attached finance export into the exact Finance JSON schema below. Do not merely rename old categories. First infer accounts, transfers, true income/expense, reimbursements/pass-through money, shared expenses and outstanding debts, recurring payments with necessity, savings goals/movements, investments/cash flows/valuations and budgets. Preserve full cash movement in amount and only my economic share in economicAmount. Never count transfers, reimbursements, debt settlements or investment movements as ordinary income/expense. Ask me focused questions instead of guessing ownership, balances, debt status, recurrence, necessity or investment value. Reconcile every final account balance and report assumptions before returning one valid JSON object.”

SECTIONS AND FIELDS
settings — optional profile settings: defaultCurrency, timezone, locale (uk | ru | en), displayName (up to 120 characters).
accounts — accounts. Required: ref, name, type (CASH | CARD | SAVINGS | OTHER), currency. Optional: emoji (Unicode/custom emoji or an existing immutable image source), openingBalance, archivedAt.
categories — category tree. Required: ref, name, type (INCOME | EXPENSE). Optional: parentRef, emoji (Unicode/custom emoji or an existing immutable image source), key, archivedAt. Parent and child must have the same type.
transactions — income/expenses. Required: ref, accountRef, type, amount, occurredAt. Optional: categoryRef, economicAmount, purpose (ORDINARY | REIMBURSEMENT | PASS_THROUGH | DEBT_REPAYMENT), necessity (UNSPECIFIED | REQUIRED | DISCRETIONARY), description, merchantDisplay, items[]. Non-ordinary purposes have zero economic impact and cannot use a category. Type must match the category. Each item requires displayName and totalAmount; quantity, unitPrice, categoryRef and free-form metadata are optional.
transfers — between two accounts. Required: ref, fromAccountRef, toAccountRef, fromAmount, toAmount, occurredAt. Accounts must differ. Optional: description.
limits — monthly budgets. Required: ref, categoryRef pointing to an EXPENSE category, amount, currency.
reminders — monthly reminders. Required: ref, name, amount, currency, dayOfMonth (1–31), nextOccurrenceAt. Optional: reminderOffsetMinutes (non-negative integer), enabled.
debts — debts. Required: ref, accountRef, direction (I_OWE | OWED_TO_ME), name, amount, dueAt, scheduleTimezone. Optional: status (OPEN | SETTLED), note. SETTLED also requires settledAt and settlementTransactionRef to a matching imported transaction.
regularPayments — recurring payments. Required: ref, accountRef, name, amount, recurrence (WEEKLY | MONTHLY | YEARLY), nextOccurrenceAt, scheduleTimezone. Optional: categoryRef pointing to EXPENSE, status (ACTIVE | PAUSED | CANCELED), necessity (UNSPECIFIED | REQUIRED | DISCRETIONARY), note.
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
• format і version мають збігатися із шаблоном. mode: "ADD" зберігає поточні записи, "REPLACE" атомарно видаляє поточні фінансові/планові дані й завантажує лише файл. Перемикач у вікні імпорту має пріоритет над mode у файлі. Ідентичність, доступ і платний тариф не замінюються.
• Кожен об’єкт має унікальний ref у межах свого розділу. Це ваш локальний ідентифікатор (наприклад "cash-uah"), а не ID з бази даних.
• Зв’язки задаються полями ...Ref і посилаються на ref із цього самого файлу. Порядок об’єктів у JSON не має значення.
• Суми передавайте рядками з крапкою: "1250.50", без пробілів, ком і символів валют. openingBalance може бути від’ємним; інші суми мають бути додатними, а оцінка інвестиції може дорівнювати нулю.
• Валюта — три великі літери: UAH, USD, EUR, PLN тощо.
• Дата й час — ISO-8601, бажано UTC: "2026-09-08T09:30:00.000Z". Часовий пояс — IANA, наприклад "Europe/Kyiv".
• Порожні розділи можна передати як [] або пропустити. Регістр назв полів важливий. Невідомі поля та некоректні enum-значення відхиляються.
• Сервер спочатку перевіряє весь файл, готує історичні курси валют і лише потім записує все однією транзакцією. Помилка в одному рядку скасовує весь імпорт.
• У режимі ADD повторне завантаження точно такого самого JSON не дублює дані. REPLACE завжди приводить поточні дані у відповідність до файлу.
• У вікні в реальному часі показуються етапи перевірки, підготовки курсів і запису кожного розділу. Активний імпорт можна скасувати.
• Аналітика й баланси перераховуються. Тариф, облікові дані бота/AI та Telegram-ідентичність не переносяться.

СТРАТЕГІЯ МІГРАЦІЇ — НЕ КОПІЮЙТЕ СТАРІ КАТЕГОРІЇ МЕХАНІЧНО
1. Спочатку перелічіть рахунки, операції, перекази між власними рахунками, регулярні зобов’язання, борги, накопичення, інвестиції та бюджети. Оберіть дату початку й збережіть реальні дати.
2. Рахунки — це реальні місця з доступними коштами. openingBalance дорівнює балансу безпосередньо перед першою імпортованою операцією. Після перетворення звірте кінцевий баланс кожного рахунку з джерелом.
3. Рух між власними рахунками, включно з обміном валют, перетворюйте на один transfer, а не на дохід і витрату.
4. Плюс на рахунку не завжди є доходом. Повернення й компенсації мають purpose REIMBURSEMENT; гроші для оплати за іншу людину — PASS_THROUGH; повернення вашого боргу — EXPENSE з DEBT_REPAYMENT. Для них economicAmount дорівнює "0". Зарплата/продаж — ORDINARY з реальною економічною сумою.
5. У спільній покупці amount — повне списання, purpose — ORDINARY, economicAmount — лише ваша частка, а несплачені частки інших людей — борги OWED_TO_ME. Пізніше повернення грошей — INCOME з REIMBURSEMENT та economicAmount "0"; цю транзакцію вкажіть як settlementTransactionRef погашеного боргу.
6. Підписки не повинні залишатися лише категорією. Історичні списання збережіть як transactions, майбутній розклад — regularPayments. Укажіть necessity REQUIRED, DISCRETIONARY або UNSPECIFIED.
7. Суми, які ви винні або мають повернути вам, перетворіть на debts. Погашення змінює баланс рахунку, але не збільшує дохід/витрату.
8. Позиції перенесіть у investments, внесення/повернення — investmentCashFlows, відомі вартості — investmentValuations. Внесок не є звичайною витратою, повернення — звичайним доходом.
9. Конверти й цілі — savingsGoals, розподіли коштів — savingsMovements. Вони резервують наявні гроші, але не створюють доходу чи витрати.
10. Бюджети категорій перенесіть у limits, а reminders використовуйте лише для нагадувань, які не є регулярними платежами. Побудуйте корисне дерево категорій замість випадкових папок старої системи.
11. Не дублюйте одну подію: transfer, інвестиційний рух, розподіл накопичень або погашення з нульовим економічним впливом не повинні мати другу звичайну транзакцію.
12. Перед імпортом перевірте refs, валюти, десяткові рядки сум, дати/часові пояси, кінцеві баланси й те, що аналітика містить тільки вашу економічну частку.

ПРОМПТ ДЛЯ ПЕРЕТВОРЕННЯ БУДЬ-ЯКОГО ДЖЕРЕЛА ШІ
«Перетвори прикріплений фінансовий експорт на точну JSON-схему Finance нижче. Не перейменовуй старі категорії механічно. Спочатку визнач рахунки, перекази, справжні доходи/витрати, компенсації й транзитні гроші, спільні витрати та непогашені борги, регулярні платежі з necessity, цілі/рухи накопичень, інвестиції/грошові потоки/оцінки та бюджети. У amount збережи повний рух коштів, в economicAmount — лише мою економічну частку. Не рахуй перекази, компенсації, погашення боргів або інвестиційні рухи звичайним доходом/витратою. Якщо неясні власник коштів, баланс, статус боргу, періодичність, necessity або вартість інвестиції — постав конкретне запитання. Звір кінцевий баланс кожного рахунку й перед JSON наведи припущення».

РОЗДІЛИ ТА ПОЛЯ
settings — необов’язкові налаштування профілю: defaultCurrency, timezone, locale (uk | ru | en), displayName (до 120 символів).
accounts — рахунки. Обов’язкові: ref, name, type (CASH | CARD | SAVINGS | OTHER), currency. Необов’язкові: emoji (Unicode/custom emoji або наявне незмінне джерело зображення), openingBalance, archivedAt.
categories — дерево категорій. Обов’язкові: ref, name, type (INCOME | EXPENSE). Необов’язкові: parentRef, emoji (Unicode/custom emoji або наявне незмінне джерело зображення), key, archivedAt. Тип батьківської та дочірньої категорії має збігатися.
transactions — доходи й витрати. Обов’язкові: ref, accountRef, type, amount, occurredAt. Необов’язкові: categoryRef, economicAmount, purpose (ORDINARY | REIMBURSEMENT | PASS_THROUGH | DEBT_REPAYMENT), necessity (UNSPECIFIED | REQUIRED | DISCRETIONARY), description, merchantDisplay, items[]. Не-ORDINARY операції мають нульовий економічний вплив і не можуть мати категорію. Тип операції має збігатися з типом категорії.
transfers — перекази між рахунками. Обов’язкові: ref, fromAccountRef, toAccountRef, fromAmount, toAmount, occurredAt. Рахунки мають відрізнятися. Необов’язкове: description.
limits — місячні бюджети. Обов’язкові: ref, categoryRef на EXPENSE-категорію, amount, currency.
reminders — щомісячні нагадування. Обов’язкові: ref, name, amount, currency, dayOfMonth (1–31), nextOccurrenceAt. Необов’язкові: reminderOffsetMinutes (ціле число ≥ 0), enabled.
debts — борги. Обов’язкові: ref, accountRef, direction (I_OWE | OWED_TO_ME), name, amount, dueAt, scheduleTimezone. Необов’язкові: status (OPEN | SETTLED), note. Для SETTLED також потрібні settledAt і settlementTransactionRef на відповідну імпортовану транзакцію.
regularPayments — регулярні платежі. Обов’язкові: ref, accountRef, name, amount, recurrence (WEEKLY | MONTHLY | YEARLY), nextOccurrenceAt, scheduleTimezone. Необов’язкові: categoryRef на EXPENSE-категорію, status (ACTIVE | PAUSED | CANCELED), necessity (UNSPECIFIED | REQUIRED | DISCRETIONARY), note.
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
• format и version должны совпадать с шаблоном. mode: "ADD" сохраняет текущие записи, "REPLACE" атомарно удаляет текущие финансовые/плановые данные и загружает только файл. Переключатель в окне импорта имеет приоритет над mode файла. Личность, доступ и платный тариф не заменяются.
• У каждого объекта должен быть уникальный ref внутри его раздела. Это ваш локальный идентификатор (например "cash-uah"), а не ID из базы данных.
• Связи задаются полями ...Ref и указывают на ref из этого же файла. Фактический порядок объектов в JSON значения не имеет.
• Суммы передаются строками с точкой: "1250.50", без пробелов, запятых и символов валют. openingBalance может быть отрицательным; остальные суммы должны быть положительными, а оценка инвестиции может быть нулевой.
• Валюта — три заглавные буквы: UAH, USD, EUR, PLN и т. д.
• Дата и время — ISO-8601, желательно UTC: "2026-09-08T09:30:00.000Z". Часовой пояс — IANA, например "Europe/Kyiv".
• Пустой раздел можно передать как [] или не передавать. Регистр в названиях полей важен. Неизвестные поля и неверные enum-значения отклоняются.
• Сервер сначала проверяет весь файл, подготавливает исторические курсы валют и только затем записывает всё одной транзакцией. Ошибка в одной строке отменяет весь импорт.
• В режиме ADD повторная загрузка того же JSON не создаёт дубликаты. REPLACE всегда приводит текущие данные в соответствие файлу.
• В окне в реальном времени показываются проверка, подготовка курсов и запись каждого раздела. Активный импорт можно отменить.
• Аналитика и балансы пересчитываются. Тариф, учётные данные бота/AI и Telegram-идентичность не переносятся.

СТРАТЕГИЯ МИГРАЦИИ — НЕ КОПИРУЙТЕ СТАРЫЕ КАТЕГОРИИ МЕХАНИЧЕСКИ
1. Сначала перечислите счета, операции, переводы между своими счетами, регулярные обязательства, долги, накопления, инвестиции и бюджеты. Выберите дату начала и сохраните реальные даты.
2. Счета — реальные места хранения доступных денег. openingBalance — баланс непосредственно перед первой импортируемой операцией. После преобразования сверьте конечный баланс каждого счёта с источником.
3. Движение между своими счетами, включая обмен валют, переносите как один transfer, а не доход плюс расход.
4. Плюс на счёте не всегда доход. Возвраты и компенсации получают purpose REIMBURSEMENT; деньги для оплаты за другого человека — PASS_THROUGH; возврат вашего долга — EXPENSE с DEBT_REPAYMENT. Для них economicAmount равен "0". Зарплата/продажа — ORDINARY с реальной экономической суммой.
5. В общей покупке amount — полное списание, purpose — ORDINARY, economicAmount — только ваша доля, а неоплаченные доли других людей — долги OWED_TO_ME. Поздний возврат денег — INCOME с REIMBURSEMENT и economicAmount "0"; эту транзакцию укажите как settlementTransactionRef погашенного долга.
6. Подписки не должны оставаться только категорией. Исторические списания сохраните как transactions, будущий график — regularPayments. Укажите necessity REQUIRED, DISCRETIONARY или UNSPECIFIED.
7. Суммы, которые должны вы или вам, перенесите в debts. Погашение меняет баланс счёта, но не увеличивает доход/расход.
8. Позиции перенесите в investments, взносы/возвраты — investmentCashFlows, известную стоимость — investmentValuations. Взнос не является обычным расходом, возврат — обычным доходом.
9. Конверты и цели — savingsGoals, распределения денег — savingsMovements. Они резервируют существующие деньги, но не создают доход или расход.
10. Бюджеты категорий перенесите в limits, reminders используйте только для напоминаний, которые не являются регулярными платежами. Постройте полезное дерево категорий вместо случайных папок старой системы.
11. Не дублируйте одно событие: transfer, инвестиционное движение, распределение накоплений или погашение с нулевым экономическим эффектом не должны иметь вторую обычную транзакцию.
12. До импорта проверьте refs, валюты, десятичные строки сумм, даты/часовые пояса, конечные балансы и то, что аналитика содержит только вашу экономическую долю.

ПРОМПТ ДЛЯ ПРЕОБРАЗОВАНИЯ ЛЮБОГО ИСТОЧНИКА ИИ
«Преобразуй прикреплённый финансовый экспорт в точную JSON-схему Finance ниже. Не переименовывай старые категории механически. Сначала определи счета, переводы, настоящие доходы/расходы, компенсации и транзитные деньги, общие расходы и непогашенные долги, регулярные платежи с necessity, цели/движения накоплений, инвестиции/денежные потоки/оценки и бюджеты. В amount сохрани полный денежный поток, в economicAmount — только мою экономическую долю. Не считай переводы, компенсации, погашения долгов или инвестиционные движения обычным доходом/расходом. Если неясны владелец денег, баланс, статус долга, периодичность, necessity или стоимость инвестиции — задай конкретный вопрос. Сверь конечный баланс каждого счёта и перед JSON перечисли допущения».

РАЗДЕЛЫ И ПОЛЯ
settings — необязательные настройки профиля: defaultCurrency, timezone, locale (uk | ru | en), displayName (до 120 символов).
accounts — счета. Обязательные: ref, name, type (CASH | CARD | SAVINGS | OTHER), currency. Необязательные: emoji (Unicode/custom emoji или существующий неизменяемый источник изображения), openingBalance, archivedAt.
categories — дерево категорий. Обязательные: ref, name, type (INCOME | EXPENSE). Необязательные: parentRef, emoji (Unicode/custom emoji или существующий неизменяемый источник изображения), key, archivedAt. Тип родительской и дочерней категории должен совпадать.
transactions — доходы и расходы. Обязательные: ref, accountRef, type, amount, occurredAt. Необязательные: categoryRef, economicAmount, purpose (ORDINARY | REIMBURSEMENT | PASS_THROUGH | DEBT_REPAYMENT), necessity (UNSPECIFIED | REQUIRED | DISCRETIONARY), description, merchantDisplay, items[]. Не-ORDINARY операции имеют нулевой экономический эффект и не могут иметь категорию. Тип операции должен совпадать с типом категории.
transfers — переводы между счетами. Обязательные: ref, fromAccountRef, toAccountRef, fromAmount, toAmount, occurredAt. Счета должны различаться. Необязательное: description.
limits — месячные бюджеты. Обязательные: ref, categoryRef на EXPENSE-категорию, amount, currency.
reminders — ежемесячные напоминания. Обязательные: ref, name, amount, currency, dayOfMonth (1–31), nextOccurrenceAt. Необязательные: reminderOffsetMinutes (целое число ≥ 0), enabled.
debts — долги. Обязательные: ref, accountRef, direction (I_OWE | OWED_TO_ME), name, amount, dueAt, scheduleTimezone. Необязательные: status (OPEN | SETTLED), note. Для SETTLED также нужны settledAt и settlementTransactionRef на соответствующую импортированную транзакцию.
regularPayments — регулярные платежи. Обязательные: ref, accountRef, name, amount, recurrence (WEEKLY | MONTHLY | YEARLY), nextOccurrenceAt, scheduleTimezone. Необязательные: categoryRef на EXPENSE-категорию, status (ACTIVE | PAUSED | CANCELED), necessity (UNSPECIFIED | REQUIRED | DISCRETIONARY), note.
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

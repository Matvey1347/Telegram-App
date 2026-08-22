export const FINANCE_CHAT_LOCALES = ['uk', 'ru', 'en'] as const;
export type FinanceChatLocale = (typeof FINANCE_CHAT_LOCALES)[number];

type Message = string | ((values: Record<string, string | number>) => string);
type Translation = Record<string, Message>;

const en = {
  menuOpen: '📱 Open Finance',
  menuExpense: '💸 Add expense',
  menuIncome: '💰 Add income',
  menuRecent: '🧾 Recent',
  menuAccounts: '🏦 Accounts',
  menuCategories: '🏷️ Categories',
  menuTransfer: '↔️ Transfer',
  menuSettings: '⚙️ Settings',
  menuHelp: '❓ Help',
  welcome:
    '👋 Welcome to Finance\n\nRecord a transaction here in seconds, or open the Mini App for accounts, categories, budget, and insights.',
  reminderNotification: ({ name, amount, currency }) =>
    `Reminder: ${name}\n${amount} ${currency}`,
  incomeHelp: '💰 Add income\n\nSend it as: +125.50 client payment',
  expenseHelp: '💸 Add expense\n\nSend it as: 125.50 groceries',
  help: '❓ Finance Bot guide\n\n💸 Expense: 125.50 groceries\n💰 Income: +3000 client payment\n🧠 Free quick input uses the syntax above. Pro adds free-form AI and voice; receipt scans have plan limits.\n📱 Open Finance for history, analytics, budgets, and full settings.\n\nEvery operation is reviewed before it is saved.',
  openFinance:
    '📱 Open Finance for accounts, categories, budgets, goals, and detailed history.',
  noMiniApp:
    'The Mini App needs a public HTTPS URL before it can open in Telegram.',
  recentTitle: '🧾 Recent transactions',
  noTransactions:
    '🧾 No transactions yet. Add your first expense or income to get started.',
  recentError:
    'I couldn’t load recent transactions right now. Please try again in Finance.',
  accountsTitle: '🏦 Accounts',
  noAccounts: '🏦 No active accounts yet. Add one below.',
  accountsError:
    'I couldn’t load accounts right now. Please try again in Finance.',
  addAccount: '➕ Add account',
  transferAccounts: '↔️ Transfer between accounts',
  categoriesTitle: '🏷️ Categories',
  expenses: '💸 Expenses',
  income: '💰 Income',
  none: 'None',
  noCategories: '🏷️ No categories yet. Create your first category in Finance.',
  manageCategories: '🏷️ Manage categories',
  addCategory: '➕ Add category',
  manageInFinance: 'Open all in Finance',
  categoriesError:
    'I couldn’t load categories right now. Please try again in Finance.',
  transfer: '↔️ Transfer',
  transferNeedAccounts:
    'Create at least two active accounts to transfer money between them.',
  transferMissingAccounts: ({ count }) =>
    `You need ${count} more active account${count === 1 ? '' : 's'} before you can transfer. Create it now or manage accounts in Finance.`,
  transferReady: ({ count }) =>
    `Move money between ${count} accounts. Choose the source, destination, and amount.`,
  startTransfer: '↔️ Start transfer',
  manageAccounts: 'Manage accounts',
  aiGate:
    'AI input is a Pro feature. Free quick input still works: “250 coffee” or “+3000 salary”.',
  receiptGate: 'Receipt recognition is a Pro feature.',
  unlockPro: '✨ Unlock Pro',
  proActive: 'Finance Pro is active. Thank you!',
  paymentInvalid: 'This Finance subscription offer is no longer valid.',
  proposalExpired:
    'That proposal is no longer available. Please create a new one and try again.',
  flowFailed:
    'I couldn’t complete that step. Your draft is still safe; review the current choices and try again.',
  saved: ({ count }) =>
    `Transaction${count === 1 ? '' : 's'} saved. You can undo ${count === 1 ? 'it' : 'them'} in Finance for the next 10 minutes.`,
  cancelled:
    'Nothing was saved. You can send another amount whenever you’re ready.',
  save: 'Save transaction',
  saveAll: 'Save all',
  saveReceipt: 'Save receipt',
  cancel: 'Cancel',
  saving: 'Saving…',
  cancelling: 'Cancelling…',
  unavailable: 'This action is no longer available.',
  browserLoginApproved:
    '✅ Browser login approved. Return to the Finance page — it will open automatically.',
  browserLoginExpired:
    'This browser login request has expired. Return to the Finance page and create a new one.',
  receiptLarge:
    'This receipt is larger than 8 MB. Please send a smaller image or document.',
  receiptError:
    'I couldn’t read that receipt. Please try a clear photo or add the transaction manually.',
  voiceLarge:
    'This voice message is larger than 8 MB. Please send a shorter one.',
  voiceError:
    'I couldn’t understand that voice message. Please try again or type it instead.',
  aiError:
    'I couldn’t turn that into a transaction. Try “25 coffee” or “+125 invoice”.',
  receiptProposal: 'Receipt proposal',
  suggested: ({ count }) => `Suggested transactions (${count})`,
  review: 'Review them carefully. Nothing is saved until you confirm.',
  transaction: 'Transaction',
  expense: 'Expense',
  incomeLabel: 'Income',
  amount: 'Amount',
  category: 'Category',
  account: 'Account',
  other: 'Other',
  description: 'Description',
  notProvided: '—',
  batchItem: ({
    index,
    type,
    amount,
    currency,
    category,
    account,
    description,
  }) =>
    `${index}. ${type} — ${amount} ${currency}\n${category} · 🏦 ${account}\n📝 ${description}`,
  accountNamePrompt:
    '🏦 Add account\n\nWhat should we call it? Send a short name, for example “Cash” or “My card”.',
  accountCurrencyPrompt: ({ name }) => `Great — ${name}. Choose its currency.`,
  accountBalancePrompt:
    'What is the opening balance? Send a number, or choose zero.',
  accountCreated: ({ name, currency, balance }) =>
    `✅ ${name} created\n${balance} ${currency}`,
  accountCancelled: 'Account setup cancelled.',
  accountInvalidName: 'Please send an account name up to 80 characters.',
  accountInvalidCurrency:
    'Choose one of the listed currencies or send a 3-letter ISO code.',
  accountInvalidBalance:
    'Please send a valid amount up to 12 digits with at most 2 decimals, for example 125.50.',
  zeroBalance: '0',
  chooseCurrency: 'Choose currency',
  cancelFlow: 'Cancel',
  settingsSummary: ({ currency }) =>
    `⚙️ Settings\n\nPrimary currency: ${currency}\nChoose language here. Open Finance for currency, timezone, notifications, and plan settings.`,
  changeLanguage: '🌐 Language',
  fullSettings: '⚙️ Full settings',
  subscription: '✨ Plan & subscription',
  archive: 'Archive',
  flowExpired:
    'This draft expired. Start the action again from the menu below.',
  transactionCreated: '✅ Transaction saved.',
  transferCreated: '✅ Transfer saved.',
  accountSaved: '✅ Account saved.',
  categorySaved: '✅ Category saved.',
  categoryArchived: '✅ Category archived.',
  languageSaved: '✅ Language updated.',
  skip: 'Skip',
  back: '← Back',
  confirm: '✅ Confirm and save',
  cash: 'Cash',
  card: 'Card',
  savings: 'Savings',
  flowTransactionDescription:
    'Step 4 of 4 · Optional description\n\nSend a short note, or choose Skip.',
  flowTransactionAccount: 'Step 1 of 4 · Account\n\nWhich account was used?',
  flowTransactionAmount: ({ account, currency }) =>
    `Step 3 of 4 · Amount\n\nAccount: ${account} · ${currency}\nSend a positive amount, for example 125.50.`,
  flowTransactionCategory: 'Step 2 of 4 · Category\n\nChoose a category.',
  flowAccountName: 'Step 1 of 5 · Account name\n\nSend a short name.',
  flowAccountType: 'Step 2 of 5 · Account type',
  flowAccountEmoji: 'Step 3 of 5 · Account emoji',
  flowAccountCurrency: 'Step 4 of 5 · Currency',
  flowAccountBalance:
    'Step 5 of 5 · Opening balance\n\nSend 0 if the account is empty.',
  flowCategoryType: 'Step 1 of 4 · Category type',
  flowCategoryName: 'Step 2 of 4 · Category name\n\nSend a short name.',
  flowCategoryEmoji: 'Step 3 of 4 · Category emoji',
  flowCategoryParent: 'Step 4 of 4 · Parent category\n\nChoose one, or skip.',
  flowTransferDescription:
    'Step 1 of 4 · Transfer note\n\nOptional: send a description, or skip.',
  flowTransferFrom: 'Step 2 of 4 · From account',
  flowTransferTo: 'Step 3 of 4 · To account',
  flowTransferAmount:
    'Step 4 of 4 · Amount\n\nSend the amount taken from the source account.',
  flowLanguage: 'Choose your Finance Bot language.',
  reviewTransaction: ({
    type,
    amount,
    currency,
    account,
    category,
    description,
  }) =>
    `Review ${type}\n\nAmount: ${amount} ${currency}\nAccount: ${account}\nCategory: ${category}\nDescription: ${description}`,
  reviewTransfer: ({
    from,
    fromCurrency,
    to,
    toCurrency,
    amount,
    description,
  }) =>
    `Review transfer\n\nFrom: ${from} (${fromCurrency})\nTo: ${to} (${toCurrency})\nAmount sent: ${amount} ${fromCurrency}\nDestination amount is converted automatically to ${toCurrency}.\nDescription: ${description}`,
  reviewAccount: ({ name, type, currency, balance }) =>
    `Review account\n\nName: ${name}\nType: ${type}\nCurrency: ${currency}\nOpening balance: ${balance}`,
  reviewAccountEdit: ({ name, type, currency }) =>
    `Review account changes\n\nName: ${name}\nType: ${type}\nCurrency remains ${currency}.`,
  reviewCategory: ({ name, type }) =>
    `Review category\n\nName: ${name}\nType: ${type}`,
  reviewCategoryArchive: ({ name }) =>
    `Archive category “${name}”?\n\nArchived categories disappear from normal choices. Existing transactions keep their category.`,
  reviewLanguage: ({ language }) => `Review language\n\nLanguage: ${language}`,
} satisfies Translation;

const uk = {
  menuOpen: '📱 Відкрити Finance',
  menuExpense: '💸 Додати витрату',
  menuIncome: '💰 Додати дохід',
  menuRecent: '🧾 Останні',
  menuAccounts: '🏦 Рахунки',
  menuCategories: '🏷️ Категорії',
  menuTransfer: '↔️ Переказ',
  menuSettings: '⚙️ Налаштування',
  menuHelp: '❓ Допомога',
  welcome:
    '👋 Вітаємо у Finance\n\nДодавайте операції за секунди або відкрийте Mini App для рахунків, категорій, бюджету й аналітики.',
  reminderNotification: ({ name, amount, currency }) =>
    `Нагадування: ${name}\n${amount} ${currency}`,
  incomeHelp: '💰 Додати дохід\n\nНадішліть: +125.50 оплата клієнта',
  expenseHelp: '💸 Додати витрату\n\nНадішліть: 125.50 продукти',
  help: '❓ Довідка Finance Bot\n\n💸 Витрата: 125.50 продукти\n💰 Дохід: +3000 оплата клієнта\n🧠 Швидкий ввід безкоштовний. Pro додає довільний AI-текст і голос; сканування чеків має ліміти плану.\n📱 Історія, аналітика, бюджети й повні налаштування — у Finance.\n\nКожна операція зберігається лише після перевірки.',
  openFinance:
    '📱 Відкрийте Finance для рахунків, категорій, бюджетів, цілей і детальної історії.',
  noMiniApp:
    'Для відкриття Mini App у Telegram потрібна публічна HTTPS-адреса.',
  recentTitle: '🧾 Останні операції',
  noTransactions: '🧾 Операцій ще немає. Додайте першу витрату або дохід.',
  recentError:
    'Зараз не вдалося завантажити останні операції. Спробуйте ще раз у Finance.',
  accountsTitle: '🏦 Рахунки',
  noAccounts: '🏦 Активних рахунків ще немає. Додайте один нижче.',
  accountsError:
    'Зараз не вдалося завантажити рахунки. Спробуйте ще раз у Finance.',
  addAccount: '➕ Додати рахунок',
  transferAccounts: '↔️ Переказ між рахунками',
  categoriesTitle: '🏷️ Категорії',
  expenses: '💸 Витрати',
  income: '💰 Доходи',
  none: 'Немає',
  noCategories: '🏷️ Категорій ще немає. Створіть першу категорію у Finance.',
  manageCategories: '🏷️ Керувати категоріями',
  addCategory: '➕ Додати категорію',
  manageInFinance: 'Відкрити всі у Finance',
  categoriesError:
    'Зараз не вдалося завантажити категорії. Спробуйте ще раз у Finance.',
  transfer: '↔️ Переказ',
  transferNeedAccounts:
    'Створіть щонайменше два активні рахунки для переказу грошей між ними.',
  transferMissingAccounts: ({ count }) =>
    `Для переказу бракує активних рахунків: ${count}. Створіть рахунок зараз або керуйте рахунками у Finance.`,
  transferReady: ({ count }) =>
    `Переказуйте гроші між ${count} рахунками. Оберіть джерело, призначення та суму.`,
  startTransfer: '↔️ Почати переказ',
  manageAccounts: 'Керувати рахунками',
  aiGate:
    'AI-ввід — функція Pro. Безкоштовний швидкий ввід: «250 кава» або «+3000 зарплата».',
  receiptGate: 'Розпізнавання чеків — функція Pro.',
  unlockPro: '✨ Відкрити Pro',
  proActive: 'Finance Pro активний. Дякуємо!',
  paymentInvalid: 'Ця пропозиція підписки Finance більше не дійсна.',
  proposalExpired:
    'Ця пропозиція більше недоступна. Створіть нову й спробуйте ще раз.',
  flowFailed:
    'Не вдалося завершити цей крок. Чернетка збережена — перевірте доступні варіанти й спробуйте ще раз.',
  saved: ({ count }) =>
    `Операці${count === 1 ? 'ю' : 'ї'} збережено. Ї${count === 1 ? 'ї' : 'х'} можна скасувати у Finance протягом наступних 10 хвилин.`,
  cancelled:
    'Нічого не збережено. Можете надіслати іншу суму, коли будете готові.',
  save: 'Зберегти операцію',
  saveAll: 'Зберегти все',
  saveReceipt: 'Зберегти чек',
  cancel: 'Скасувати',
  saving: 'Збереження…',
  cancelling: 'Скасування…',
  unavailable: 'Ця дія більше недоступна.',
  browserLoginApproved:
    '✅ Вхід у браузері підтверджено. Поверніться на сторінку Finance — вона відкриється автоматично.',
  browserLoginExpired:
    'Цей запит на вхід уже недійсний. Поверніться на сторінку Finance і створіть новий.',
  receiptLarge:
    'Цей чек більший за 8 МБ. Надішліть менше зображення або документ.',
  receiptError:
    'Не вдалося прочитати чек. Спробуйте чітке фото або додайте операцію вручну.',
  voiceLarge: 'Це голосове повідомлення більше 8 МБ. Надішліть коротше.',
  voiceError:
    'Не вдалося розпізнати голосове повідомлення. Спробуйте ще раз або введіть текст.',
  aiError:
    'Не вдалося перетворити це на операцію. Спробуйте «25 кава» або «+125 рахунок».',
  receiptProposal: 'Пропозиція з чека',
  suggested: ({ count }) => `Запропоновані операції (${count})`,
  review: 'Перевірте уважно. Нічого не буде збережено без підтвердження.',
  transaction: 'Операція',
  expense: 'Витрата',
  incomeLabel: 'Дохід',
  amount: 'Сума',
  category: 'Категорія',
  account: 'Рахунок',
  other: 'Інше',
  description: 'Опис',
  notProvided: '—',
  batchItem: ({
    index,
    type,
    amount,
    currency,
    category,
    account,
    description,
  }) =>
    `${index}. ${type} — ${amount} ${currency}\n${category} · 🏦 ${account}\n📝 ${description}`,
  accountNamePrompt:
    '🏦 Додати рахунок\n\nЯк його назвати? Надішліть коротку назву, наприклад «Готівка» або «Моя картка».',
  accountCurrencyPrompt: ({ name }) => `Чудово — ${name}. Оберіть валюту.`,
  accountBalancePrompt:
    'Який початковий баланс? Надішліть число або виберіть нуль.',
  accountCreated: ({ name, currency, balance }) =>
    `✅ ${name} створено\n${balance} ${currency}`,
  accountCancelled: 'Створення рахунку скасовано.',
  accountInvalidName: 'Надішліть назву рахунку до 80 символів.',
  accountInvalidCurrency:
    'Оберіть валюту зі списку або надішліть трилітерний ISO-код.',
  accountInvalidBalance:
    'Надішліть суму до 12 цифр і максимум 2 знаків після коми, наприклад 125.50.',
  zeroBalance: '0',
  chooseCurrency: 'Оберіть валюту',
  cancelFlow: 'Скасувати',
  settingsSummary: ({ currency }) =>
    `⚙️ Налаштування\n\nОсновна валюта: ${currency}\nМову можна змінити тут. Валюта, часовий пояс, сповіщення та план — у Finance.`,
  changeLanguage: '🌐 Мова',
  fullSettings: '⚙️ Усі налаштування',
  subscription: '✨ План і підписка',
  archive: 'Архівувати',
  flowExpired: 'Термін дії чернетки минув. Почніть дію знову в меню нижче.',
  transactionCreated: '✅ Операцію збережено.',
  transferCreated: '✅ Переказ збережено.',
  accountSaved: '✅ Рахунок збережено.',
  categorySaved: '✅ Категорію збережено.',
  categoryArchived: '✅ Категорію архівовано.',
  languageSaved: '✅ Мову оновлено.',
  skip: 'Пропустити',
  back: '← Назад',
  confirm: '✅ Підтвердити й зберегти',
  cash: 'Готівка',
  card: 'Картка',
  savings: 'Заощадження',
  flowTransactionDescription:
    'Крок 4 із 4 · Необов’язковий опис\n\nНадішліть короткий опис або натисніть «Пропустити».',
  flowTransactionAccount: 'Крок 1 із 4 · Рахунок\n\nЯкий рахунок використано?',
  flowTransactionAmount: ({ account, currency }) =>
    `Крок 3 із 4 · Сума\n\nРахунок: ${account} · ${currency}\nНадішліть додатну суму, наприклад 125.50.`,
  flowTransactionCategory: 'Крок 2 із 4 · Категорія\n\nОберіть категорію.',
  flowAccountName: 'Крок 1 із 5 · Назва рахунку',
  flowAccountType: 'Крок 2 із 5 · Тип рахунку',
  flowAccountEmoji: 'Крок 3 із 5 · Емодзі рахунку',
  flowAccountCurrency: 'Крок 4 із 5 · Валюта',
  flowAccountBalance:
    'Крок 5 із 5 · Початковий баланс\n\nНадішліть 0, якщо рахунок порожній.',
  flowCategoryType: 'Крок 1 із 4 · Тип категорії',
  flowCategoryName: 'Крок 2 із 4 · Назва категорії',
  flowCategoryEmoji: 'Крок 3 із 4 · Емодзі категорії',
  flowCategoryParent:
    'Крок 4 із 4 · Батьківська категорія\n\nОберіть або пропустіть.',
  flowTransferDescription:
    'Крок 1 із 4 · Опис переказу\n\nНеобов’язково: надішліть опис або пропустіть.',
  flowTransferFrom: 'Крок 2 із 4 · З рахунку',
  flowTransferTo: 'Крок 3 із 4 · На рахунок',
  flowTransferAmount:
    'Крок 4 із 4 · Сума\n\nНадішліть суму списання з рахунку-джерела.',
  flowLanguage: 'Оберіть мову Finance Bot.',
  reviewTransaction: ({
    type,
    amount,
    currency,
    account,
    category,
    description,
  }) =>
    `Перевірте: ${type}\n\nСума: ${amount} ${currency}\nРахунок: ${account}\nКатегорія: ${category}\nОпис: ${description}`,
  reviewTransfer: ({
    from,
    fromCurrency,
    to,
    toCurrency,
    amount,
    description,
  }) =>
    `Перевірте переказ\n\nЗ: ${from} (${fromCurrency})\nНа: ${to} (${toCurrency})\nСума списання: ${amount} ${fromCurrency}\nСума зарахування автоматично конвертується у ${toCurrency}.\nОпис: ${description}`,
  reviewAccount: ({ name, type, currency, balance }) =>
    `Перевірте рахунок\n\nНазва: ${name}\nТип: ${type}\nВалюта: ${currency}\nПочатковий баланс: ${balance}`,
  reviewAccountEdit: ({ name, type, currency }) =>
    `Перевірте зміни рахунку\n\nНазва: ${name}\nТип: ${type}\nВалюта залишається ${currency}.`,
  reviewCategory: ({ name, type }) =>
    `Перевірте категорію\n\nНазва: ${name}\nТип: ${type}`,
  reviewCategoryArchive: ({ name }) =>
    `Архівувати категорію «${name}»?\n\nВона зникне зі звичайного вибору. Категорія збережеться в наявних операціях.`,
  reviewLanguage: ({ language }) => `Перевірте мову\n\nМова: ${language}`,
} satisfies typeof en;

const ru = {
  menuOpen: '📱 Открыть Finance',
  menuExpense: '💸 Добавить расход',
  menuIncome: '💰 Добавить доход',
  menuRecent: '🧾 Последние',
  menuAccounts: '🏦 Счета',
  menuCategories: '🏷️ Категории',
  menuTransfer: '↔️ Перевод',
  menuSettings: '⚙️ Настройки',
  menuHelp: '❓ Помощь',
  welcome:
    '👋 Добро пожаловать в Finance\n\nДобавляйте операции за секунды или откройте Mini App для счетов, категорий, бюджета и аналитики.',
  reminderNotification: ({ name, amount, currency }) =>
    `Напоминание: ${name}\n${amount} ${currency}`,
  incomeHelp: '💰 Добавить доход\n\nОтправьте: +125.50 оплата клиента',
  expenseHelp: '💸 Добавить расход\n\nОтправьте: 125.50 продукты',
  help: '❓ Справка Finance Bot\n\n💸 Расход: 125.50 продукты\n💰 Доход: +3000 оплата клиента\n🧠 Быстрый ввод бесплатен. Pro добавляет свободный AI-текст и голос; сканирование чеков ограничено планом.\n📱 История, аналитика, бюджеты и полные настройки — в Finance.\n\nКаждая операция сохраняется только после проверки.',
  openFinance:
    '📱 Откройте Finance для счетов, категорий, бюджетов, целей и подробной истории.',
  noMiniApp: 'Чтобы открыть Mini App в Telegram, нужен публичный HTTPS-адрес.',
  recentTitle: '🧾 Последние операции',
  noTransactions: '🧾 Операций ещё нет. Добавьте первый расход или доход.',
  recentError:
    'Сейчас не удалось загрузить последние операции. Попробуйте ещё раз в Finance.',
  accountsTitle: '🏦 Счета',
  noAccounts: '🏦 Активных счетов ещё нет. Добавьте один ниже.',
  accountsError:
    'Сейчас не удалось загрузить счета. Попробуйте ещё раз в Finance.',
  addAccount: '➕ Добавить счёт',
  transferAccounts: '↔️ Перевод между счетами',
  categoriesTitle: '🏷️ Категории',
  expenses: '💸 Расходы',
  income: '💰 Доходы',
  none: 'Нет',
  noCategories: '🏷️ Категорий ещё нет. Создайте первую категорию в Finance.',
  manageCategories: '🏷️ Управлять категориями',
  addCategory: '➕ Добавить категорию',
  manageInFinance: 'Открыть все в Finance',
  categoriesError:
    'Сейчас не удалось загрузить категории. Попробуйте ещё раз в Finance.',
  transfer: '↔️ Перевод',
  transferNeedAccounts:
    'Создайте хотя бы два активных счёта, чтобы переводить деньги между ними.',
  transferMissingAccounts: ({ count }) =>
    `Для перевода не хватает активных счетов: ${count}. Создайте счёт сейчас или управляйте счетами в Finance.`,
  transferReady: ({ count }) =>
    `Переводите деньги между ${count} счетами. Выберите источник, назначение и сумму.`,
  startTransfer: '↔️ Начать перевод',
  manageAccounts: 'Управлять счетами',
  aiGate:
    'AI-ввод — функция Pro. Бесплатный быстрый ввод: «250 кофе» или «+3000 зарплата».',
  receiptGate: 'Распознавание чеков — функция Pro.',
  unlockPro: '✨ Открыть Pro',
  proActive: 'Finance Pro активен. Спасибо!',
  paymentInvalid: 'Это предложение подписки Finance больше недействительно.',
  proposalExpired:
    'Это предложение больше недоступно. Создайте новое и попробуйте ещё раз.',
  flowFailed:
    'Не удалось завершить этот шаг. Черновик сохранён — проверьте доступные варианты и попробуйте ещё раз.',
  saved: ({ count }) =>
    `Операци${count === 1 ? 'я' : 'и'} сохранен${count === 1 ? 'а' : 'ы'}. Их можно отменить в Finance в течение следующих 10 минут.`,
  cancelled:
    'Ничего не сохранено. Можете отправить другую сумму, когда будете готовы.',
  save: 'Сохранить операцию',
  saveAll: 'Сохранить всё',
  saveReceipt: 'Сохранить чек',
  cancel: 'Отменить',
  saving: 'Сохранение…',
  cancelling: 'Отмена…',
  unavailable: 'Это действие больше недоступно.',
  browserLoginApproved:
    '✅ Вход в браузере подтверждён. Вернитесь на страницу Finance — она откроется автоматически.',
  browserLoginExpired:
    'Этот запрос на вход уже недействителен. Вернитесь на страницу Finance и создайте новый.',
  receiptLarge:
    'Этот чек больше 8 МБ. Отправьте изображение или документ меньшего размера.',
  receiptError:
    'Не удалось прочитать чек. Попробуйте чёткое фото или добавьте операцию вручную.',
  voiceLarge: 'Это голосовое сообщение больше 8 МБ. Отправьте более короткое.',
  voiceError:
    'Не удалось распознать голосовое сообщение. Попробуйте ещё раз или введите текст.',
  aiError:
    'Не удалось превратить это в операцию. Попробуйте «25 кофе» или «+125 счёт».',
  receiptProposal: 'Предложение из чека',
  suggested: ({ count }) => `Предложенные операции (${count})`,
  review: 'Внимательно проверьте. Ничего не будет сохранено без подтверждения.',
  transaction: 'Операция',
  expense: 'Расход',
  incomeLabel: 'Доход',
  amount: 'Сумма',
  category: 'Категория',
  account: 'Счёт',
  other: 'Другое',
  description: 'Описание',
  notProvided: '—',
  batchItem: ({
    index,
    type,
    amount,
    currency,
    category,
    account,
    description,
  }) =>
    `${index}. ${type} — ${amount} ${currency}\n${category} · 🏦 ${account}\n📝 ${description}`,
  accountNamePrompt:
    '🏦 Добавить счёт\n\nКак его назвать? Отправьте короткое название, например «Наличные» или «Моя карта».',
  accountCurrencyPrompt: ({ name }) => `Отлично — ${name}. Выберите валюту.`,
  accountBalancePrompt:
    'Какой начальный баланс? Отправьте число или выберите ноль.',
  accountCreated: ({ name, currency, balance }) =>
    `✅ ${name} создан\n${balance} ${currency}`,
  accountCancelled: 'Создание счёта отменено.',
  accountInvalidName: 'Отправьте название счёта до 80 символов.',
  accountInvalidCurrency:
    'Выберите валюту из списка или отправьте трёхбуквенный ISO-код.',
  accountInvalidBalance:
    'Отправьте сумму до 12 цифр и максимум 2 знаков после запятой, например 125.50.',
  zeroBalance: '0',
  chooseCurrency: 'Выберите валюту',
  cancelFlow: 'Отменить',
  settingsSummary: ({ currency }) =>
    `⚙️ Настройки\n\nОсновная валюта: ${currency}\nЯзык можно изменить здесь. Валюта, часовой пояс, уведомления и план — в Finance.`,
  changeLanguage: '🌐 Язык',
  fullSettings: '⚙️ Все настройки',
  subscription: '✨ План и подписка',
  archive: 'Архивировать',
  flowExpired:
    'Срок действия черновика истёк. Начните действие снова в меню ниже.',
  transactionCreated: '✅ Операция сохранена.',
  transferCreated: '✅ Перевод сохранён.',
  accountSaved: '✅ Счёт сохранён.',
  categorySaved: '✅ Категория сохранена.',
  categoryArchived: '✅ Категория архивирована.',
  languageSaved: '✅ Язык обновлён.',
  skip: 'Пропустить',
  back: '← Назад',
  confirm: '✅ Подтвердить и сохранить',
  cash: 'Наличные',
  card: 'Карта',
  savings: 'Сбережения',
  flowTransactionDescription:
    'Шаг 4 из 4 · Необязательное описание\n\nОтправьте короткое описание или нажмите «Пропустить».',
  flowTransactionAccount: 'Шаг 1 из 4 · Счёт\n\nКакой счёт использован?',
  flowTransactionAmount: ({ account, currency }) =>
    `Шаг 3 из 4 · Сумма\n\nСчёт: ${account} · ${currency}\nОтправьте положительную сумму, например 125.50.`,
  flowTransactionCategory: 'Шаг 2 из 4 · Категория\n\nВыберите категорию.',
  flowAccountName: 'Шаг 1 из 5 · Название счёта',
  flowAccountType: 'Шаг 2 из 5 · Тип счёта',
  flowAccountEmoji: 'Шаг 3 из 5 · Эмодзи счёта',
  flowAccountCurrency: 'Шаг 4 из 5 · Валюта',
  flowAccountBalance:
    'Шаг 5 из 5 · Начальный баланс\n\nОтправьте 0, если счёт пуст.',
  flowCategoryType: 'Шаг 1 из 4 · Тип категории',
  flowCategoryName: 'Шаг 2 из 4 · Название категории',
  flowCategoryEmoji: 'Шаг 3 из 4 · Эмодзи категории',
  flowCategoryParent:
    'Шаг 4 из 4 · Родительская категория\n\nВыберите или пропустите.',
  flowTransferDescription:
    'Шаг 1 из 4 · Описание перевода\n\nНеобязательно: отправьте описание или пропустите.',
  flowTransferFrom: 'Шаг 2 из 4 · Со счёта',
  flowTransferTo: 'Шаг 3 из 4 · На счёт',
  flowTransferAmount:
    'Шаг 4 из 4 · Сумма\n\nОтправьте сумму списания с исходного счёта.',
  flowLanguage: 'Выберите язык Finance Bot.',
  reviewTransaction: ({
    type,
    amount,
    currency,
    account,
    category,
    description,
  }) =>
    `Проверьте: ${type}\n\nСумма: ${amount} ${currency}\nСчёт: ${account}\nКатегория: ${category}\nОписание: ${description}`,
  reviewTransfer: ({
    from,
    fromCurrency,
    to,
    toCurrency,
    amount,
    description,
  }) =>
    `Проверьте перевод\n\nС: ${from} (${fromCurrency})\nНа: ${to} (${toCurrency})\nСумма списания: ${amount} ${fromCurrency}\nСумма зачисления автоматически конвертируется в ${toCurrency}.\nОписание: ${description}`,
  reviewAccount: ({ name, type, currency, balance }) =>
    `Проверьте счёт\n\nНазвание: ${name}\nТип: ${type}\nВалюта: ${currency}\nНачальный баланс: ${balance}`,
  reviewAccountEdit: ({ name, type, currency }) =>
    `Проверьте изменения счёта\n\nНазвание: ${name}\nТип: ${type}\nВалюта остаётся ${currency}.`,
  reviewCategory: ({ name, type }) =>
    `Проверьте категорию\n\nНазвание: ${name}\nТип: ${type}`,
  reviewCategoryArchive: ({ name }) =>
    `Архивировать категорию «${name}»?\n\nОна исчезнет из обычного выбора. Категория сохранится в существующих операциях.`,
  reviewLanguage: ({ language }) => `Проверьте язык\n\nЯзык: ${language}`,
} satisfies typeof en;

export const financeChatTranslations = { en, uk, ru } as const satisfies Record<
  FinanceChatLocale,
  Translation
>;
export type FinanceChatKey = keyof typeof en;

export function normalizeFinanceLocale(
  value?: string | null,
): FinanceChatLocale {
  const language = value?.trim().toLowerCase().split(/[-_]/u)[0];
  return language === 'uk' || language === 'ru' || language === 'en'
    ? language
    : 'en';
}

export function financeChatLocale(
  profileLocale?: string | null,
  telegramLocale?: string | null,
): FinanceChatLocale {
  return profileLocale &&
    FINANCE_CHAT_LOCALES.includes(normalizeFinanceLocale(profileLocale))
    ? normalizeFinanceLocale(profileLocale)
    : normalizeFinanceLocale(telegramLocale);
}

export function t(
  locale: FinanceChatLocale,
  key: FinanceChatKey,
  values: Record<string, string | number> = {},
) {
  const message = financeChatTranslations[locale][key] || en[key];
  return typeof message === 'function' ? message(values) : message;
}

const categoryLabels: Record<FinanceChatLocale, Record<string, string>> = {
  en: {
    food: 'Food',
    transport: 'Transport',
    fuel: 'Fuel',
    home: 'Home',
    subscriptions: 'Subscriptions',
    shopping: 'Shopping',
    health: 'Health',
    entertainment: 'Entertainment',
    other: 'Other',
    salary: 'Salary',
    'other-income': 'Other income',
  },
  uk: {
    food: 'Їжа',
    transport: 'Транспорт',
    fuel: 'Пальне',
    home: 'Дім',
    subscriptions: 'Підписки',
    shopping: 'Покупки',
    health: 'Здоров’я',
    entertainment: 'Розваги',
    other: 'Інше',
    salary: 'Зарплата',
    'other-income': 'Інші доходи',
  },
  ru: {
    food: 'Еда',
    transport: 'Транспорт',
    fuel: 'Топливо',
    home: 'Дом',
    subscriptions: 'Подписки',
    shopping: 'Покупки',
    health: 'Здоровье',
    entertainment: 'Развлечения',
    other: 'Другое',
    salary: 'Зарплата',
    'other-income': 'Другие доходы',
  },
};

/** Default category keys are stable; only their presentation is localized. */
export function financeCategoryLabel(
  locale: FinanceChatLocale,
  key: string | null | undefined,
  fallback: string,
) {
  return (key && categoryLabels[locale][key]) || fallback;
}

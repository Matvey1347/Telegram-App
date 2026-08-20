export const FINANCE_CHAT_LOCALES = ['uk', 'ru', 'en'] as const;
export type FinanceChatLocale = (typeof FINANCE_CHAT_LOCALES)[number];

type Message = string | ((values: Record<string, string | number>) => string);
type Translation = Record<string, Message>;

const en = {
  menuOpen: '📱 Open Finance', menuExpense: '💸 Add expense', menuIncome: '💰 Add income', menuRecent: '🧾 Recent', menuAccounts: '🏦 Accounts', menuCategories: '🏷️ Categories', menuTransfer: '↔️ Transfer', menuHelp: '❓ Help',
  welcome: '👋 Welcome to Finance\n\nRecord a transaction here in seconds, or open the Mini App for accounts, categories, budget, and insights.',
  incomeHelp: '💰 Add income\n\nSend it as: +125.50 client payment', expenseHelp: '💸 Add expense\n\nSend it as: 125.50 groceries',
  help: '❓ Quick guide\n\n💸 Expense: 125.50 groceries\n💰 Income: +3000 client payment\n📱 Mini App: accounts, categories, budgets, and detailed history\n\nEvery transaction is confirmed before it is saved.',
  openFinance: '📱 Open Finance for accounts, categories, budgets, goals, and detailed history.', noMiniApp: 'The Mini App needs a public HTTPS URL before it can open in Telegram.',
  recentTitle: '🧾 Recent transactions', noTransactions: '🧾 No transactions yet. Add your first expense or income to get started.', recentError: 'I couldn’t load recent transactions right now. Please try again in Finance.',
  accountsTitle: '🏦 Accounts', noAccounts: '🏦 No active accounts yet. Add one below.', accountsError: 'I couldn’t load accounts right now. Please try again in Finance.', addAccount: '➕ Add account', transferAccounts: '↔️ Transfer between accounts',
  categoriesTitle: '🏷️ Categories', expenses: '💸 Expenses', income: '💰 Income', none: 'None', noCategories: '🏷️ No categories yet. Create your first category in Finance.', manageCategories: '🏷️ Manage categories', categoriesError: 'I couldn’t load categories right now. Please try again in Finance.',
  transfer: '↔️ Transfer', transferNeedAccounts: 'Create at least two active accounts to transfer money between them.', transferReady: ({ count }) => `Move money between ${count} accounts. Choose the source, destination, and amount.`, startTransfer: '↔️ Start transfer',
  aiGate: 'AI input is a Pro feature. Free quick input still works: “250 coffee” or “+3000 salary”.', receiptGate: 'Receipt recognition is a Pro feature.', unlockPro: '✨ Unlock Pro', proActive: 'Finance Pro is active. Thank you!', paymentInvalid: 'This Finance subscription offer is no longer valid.',
  proposalExpired: 'That proposal is no longer available. Please create a new one and try again.', saved: ({ count }) => `Transaction${count === 1 ? '' : 's'} saved. You can undo ${count === 1 ? 'it' : 'them'} in Finance for the next 10 minutes.`, cancelled: 'Nothing was saved. You can send another amount whenever you’re ready.', save: 'Save transaction', saveAll: 'Save all', saveReceipt: 'Save receipt', cancel: 'Cancel', saving: 'Saving…', cancelling: 'Cancelling…', unavailable: 'This action is no longer available.',
  receiptLarge: 'This receipt is larger than 8 MB. Please send a smaller image or document.', receiptError: 'I couldn’t read that receipt. Please try a clear photo or add the transaction manually.', aiError: 'I couldn’t turn that into a transaction. Try “25 coffee” or “+125 invoice”.',
  receiptProposal: 'Receipt proposal', suggested: ({ count }) => `Suggested transactions (${count})`, review: 'Review them carefully. Nothing is saved until you confirm.', transaction: 'Transaction', expense: 'Expense', incomeLabel: 'Income', amount: 'Amount', category: 'Category', account: 'Account', other: 'Other', description: 'Description', notProvided: '—',
  batchItem: ({ index, type, amount, currency, category, account, description }) => `${index}. ${type} — ${amount} ${currency}\n${category} · 🏦 ${account}\n📝 ${description}`,
  accountNamePrompt: '🏦 Add account\n\nWhat should we call it? Send a short name, for example “Cash” or “My card”.', accountCurrencyPrompt: ({ name }) => `Great — ${name}. Choose its currency.`, accountBalancePrompt: 'What is the opening balance? Send a number, or choose zero.', accountCreated: ({ name, currency, balance }) => `✅ ${name} created\n${balance} ${currency}`, accountCancelled: 'Account setup cancelled.', accountInvalidName: 'Please send an account name up to 80 characters.', accountInvalidCurrency: 'Choose one of the listed currencies or send a 3-letter ISO code.', accountInvalidBalance: 'Please send a valid opening balance, for example 0 or 125.50.', zeroBalance: '0', chooseCurrency: 'Choose currency', cancelFlow: 'Cancel',
} satisfies Translation;

const uk = {
  menuOpen: '📱 Відкрити Finance', menuExpense: '💸 Додати витрату', menuIncome: '💰 Додати дохід', menuRecent: '🧾 Останні', menuAccounts: '🏦 Рахунки', menuCategories: '🏷️ Категорії', menuTransfer: '↔️ Переказ', menuHelp: '❓ Допомога',
  welcome: '👋 Вітаємо у Finance\n\nДодавайте операції за секунди або відкрийте Mini App для рахунків, категорій, бюджету й аналітики.', incomeHelp: '💰 Додати дохід\n\nНадішліть: +125.50 оплата клієнта', expenseHelp: '💸 Додати витрату\n\nНадішліть: 125.50 продукти', help: '❓ Швидка довідка\n\n💸 Витрата: 125.50 продукти\n💰 Дохід: +3000 оплата клієнта\n📱 Mini App: рахунки, категорії, бюджет та історія\n\nКожну операцію потрібно підтвердити.',
  openFinance: '📱 Відкрийте Finance для рахунків, категорій, бюджетів, цілей і детальної історії.', noMiniApp: 'Для відкриття Mini App у Telegram потрібна публічна HTTPS-адреса.', recentTitle: '🧾 Останні операції', noTransactions: '🧾 Операцій ще немає. Додайте першу витрату або дохід.', recentError: 'Зараз не вдалося завантажити останні операції. Спробуйте ще раз у Finance.',
  accountsTitle: '🏦 Рахунки', noAccounts: '🏦 Активних рахунків ще немає. Додайте один нижче.', accountsError: 'Зараз не вдалося завантажити рахунки. Спробуйте ще раз у Finance.', addAccount: '➕ Додати рахунок', transferAccounts: '↔️ Переказ між рахунками',
  categoriesTitle: '🏷️ Категорії', expenses: '💸 Витрати', income: '💰 Доходи', none: 'Немає', noCategories: '🏷️ Категорій ще немає. Створіть першу категорію у Finance.', manageCategories: '🏷️ Керувати категоріями', categoriesError: 'Зараз не вдалося завантажити категорії. Спробуйте ще раз у Finance.',
  transfer: '↔️ Переказ', transferNeedAccounts: 'Створіть щонайменше два активні рахунки для переказу грошей між ними.', transferReady: ({ count }) => `Переказуйте гроші між ${count} рахунками. Оберіть джерело, призначення та суму.`, startTransfer: '↔️ Почати переказ',
  aiGate: 'AI-ввід — функція Pro. Безкоштовний швидкий ввід: «250 кава» або «+3000 зарплата».', receiptGate: 'Розпізнавання чеків — функція Pro.', unlockPro: '✨ Відкрити Pro', proActive: 'Finance Pro активний. Дякуємо!', paymentInvalid: 'Ця пропозиція підписки Finance більше не дійсна.',
  proposalExpired: 'Ця пропозиція більше недоступна. Створіть нову й спробуйте ще раз.', saved: ({ count }) => `Операці${count === 1 ? 'ю' : 'ї'} збережено. Ї${count === 1 ? 'ї' : 'х'} можна скасувати у Finance протягом наступних 10 хвилин.`, cancelled: 'Нічого не збережено. Можете надіслати іншу суму, коли будете готові.', save: 'Зберегти операцію', saveAll: 'Зберегти все', saveReceipt: 'Зберегти чек', cancel: 'Скасувати', saving: 'Збереження…', cancelling: 'Скасування…', unavailable: 'Ця дія більше недоступна.',
  receiptLarge: 'Цей чек більший за 8 МБ. Надішліть менше зображення або документ.', receiptError: 'Не вдалося прочитати чек. Спробуйте чітке фото або додайте операцію вручну.', aiError: 'Не вдалося перетворити це на операцію. Спробуйте «25 кава» або «+125 рахунок».',
  receiptProposal: 'Пропозиція з чека', suggested: ({ count }) => `Запропоновані операції (${count})`, review: 'Перевірте уважно. Нічого не буде збережено без підтвердження.', transaction: 'Операція', expense: 'Витрата', incomeLabel: 'Дохід', amount: 'Сума', category: 'Категорія', account: 'Рахунок', other: 'Інше', description: 'Опис', notProvided: '—', batchItem: ({ index, type, amount, currency, category, account, description }) => `${index}. ${type} — ${amount} ${currency}\n${category} · 🏦 ${account}\n📝 ${description}`,
  accountNamePrompt: '🏦 Додати рахунок\n\nЯк його назвати? Надішліть коротку назву, наприклад «Готівка» або «Моя картка».', accountCurrencyPrompt: ({ name }) => `Чудово — ${name}. Оберіть валюту.`, accountBalancePrompt: 'Який початковий баланс? Надішліть число або виберіть нуль.', accountCreated: ({ name, currency, balance }) => `✅ ${name} створено\n${balance} ${currency}`, accountCancelled: 'Створення рахунку скасовано.', accountInvalidName: 'Надішліть назву рахунку до 80 символів.', accountInvalidCurrency: 'Оберіть валюту зі списку або надішліть трилітерний ISO-код.', accountInvalidBalance: 'Надішліть коректний початковий баланс, наприклад 0 або 125.50.', zeroBalance: '0', chooseCurrency: 'Оберіть валюту', cancelFlow: 'Скасувати',
} satisfies typeof en;

const ru = {
  menuOpen: '📱 Открыть Finance', menuExpense: '💸 Добавить расход', menuIncome: '💰 Добавить доход', menuRecent: '🧾 Последние', menuAccounts: '🏦 Счета', menuCategories: '🏷️ Категории', menuTransfer: '↔️ Перевод', menuHelp: '❓ Помощь',
  welcome: '👋 Добро пожаловать в Finance\n\nДобавляйте операции за секунды или откройте Mini App для счетов, категорий, бюджета и аналитики.', incomeHelp: '💰 Добавить доход\n\nОтправьте: +125.50 оплата клиента', expenseHelp: '💸 Добавить расход\n\nОтправьте: 125.50 продукты', help: '❓ Краткая справка\n\n💸 Расход: 125.50 продукты\n💰 Доход: +3000 оплата клиента\n📱 Mini App: счета, категории, бюджет и история\n\nКаждую операцию нужно подтвердить.',
  openFinance: '📱 Откройте Finance для счетов, категорий, бюджетов, целей и подробной истории.', noMiniApp: 'Чтобы открыть Mini App в Telegram, нужен публичный HTTPS-адрес.', recentTitle: '🧾 Последние операции', noTransactions: '🧾 Операций ещё нет. Добавьте первый расход или доход.', recentError: 'Сейчас не удалось загрузить последние операции. Попробуйте ещё раз в Finance.',
  accountsTitle: '🏦 Счета', noAccounts: '🏦 Активных счетов ещё нет. Добавьте один ниже.', accountsError: 'Сейчас не удалось загрузить счета. Попробуйте ещё раз в Finance.', addAccount: '➕ Добавить счёт', transferAccounts: '↔️ Перевод между счетами',
  categoriesTitle: '🏷️ Категории', expenses: '💸 Расходы', income: '💰 Доходы', none: 'Нет', noCategories: '🏷️ Категорий ещё нет. Создайте первую категорию в Finance.', manageCategories: '🏷️ Управлять категориями', categoriesError: 'Сейчас не удалось загрузить категории. Попробуйте ещё раз в Finance.',
  transfer: '↔️ Перевод', transferNeedAccounts: 'Создайте хотя бы два активных счёта, чтобы переводить деньги между ними.', transferReady: ({ count }) => `Переводите деньги между ${count} счетами. Выберите источник, назначение и сумму.`, startTransfer: '↔️ Начать перевод',
  aiGate: 'AI-ввод — функция Pro. Бесплатный быстрый ввод: «250 кофе» или «+3000 зарплата».', receiptGate: 'Распознавание чеков — функция Pro.', unlockPro: '✨ Открыть Pro', proActive: 'Finance Pro активен. Спасибо!', paymentInvalid: 'Это предложение подписки Finance больше недействительно.',
  proposalExpired: 'Это предложение больше недоступно. Создайте новое и попробуйте ещё раз.', saved: ({ count }) => `Операци${count === 1 ? 'я' : 'и'} сохранен${count === 1 ? 'а' : 'ы'}. Их можно отменить в Finance в течение следующих 10 минут.`, cancelled: 'Ничего не сохранено. Можете отправить другую сумму, когда будете готовы.', save: 'Сохранить операцию', saveAll: 'Сохранить всё', saveReceipt: 'Сохранить чек', cancel: 'Отменить', saving: 'Сохранение…', cancelling: 'Отмена…', unavailable: 'Это действие больше недоступно.',
  receiptLarge: 'Этот чек больше 8 МБ. Отправьте изображение или документ меньшего размера.', receiptError: 'Не удалось прочитать чек. Попробуйте чёткое фото или добавьте операцию вручную.', aiError: 'Не удалось превратить это в операцию. Попробуйте «25 кофе» или «+125 счёт».',
  receiptProposal: 'Предложение из чека', suggested: ({ count }) => `Предложенные операции (${count})`, review: 'Внимательно проверьте. Ничего не будет сохранено без подтверждения.', transaction: 'Операция', expense: 'Расход', incomeLabel: 'Доход', amount: 'Сумма', category: 'Категория', account: 'Счёт', other: 'Другое', description: 'Описание', notProvided: '—', batchItem: ({ index, type, amount, currency, category, account, description }) => `${index}. ${type} — ${amount} ${currency}\n${category} · 🏦 ${account}\n📝 ${description}`,
  accountNamePrompt: '🏦 Добавить счёт\n\nКак его назвать? Отправьте короткое название, например «Наличные» или «Моя карта».', accountCurrencyPrompt: ({ name }) => `Отлично — ${name}. Выберите валюту.`, accountBalancePrompt: 'Какой начальный баланс? Отправьте число или выберите ноль.', accountCreated: ({ name, currency, balance }) => `✅ ${name} создан\n${balance} ${currency}`, accountCancelled: 'Создание счёта отменено.', accountInvalidName: 'Отправьте название счёта до 80 символов.', accountInvalidCurrency: 'Выберите валюту из списка или отправьте трёхбуквенный ISO-код.', accountInvalidBalance: 'Отправьте корректный начальный баланс, например 0 или 125.50.', zeroBalance: '0', chooseCurrency: 'Выберите валюту', cancelFlow: 'Отменить',
} satisfies typeof en;

export const financeChatTranslations = { en, uk, ru } as const satisfies Record<FinanceChatLocale, Translation>;
export type FinanceChatKey = keyof typeof en;

export function normalizeFinanceLocale(value?: string | null): FinanceChatLocale {
  const language = value?.trim().toLowerCase().split(/[-_]/u)[0];
  return language === 'uk' || language === 'ru' || language === 'en' ? language : 'en';
}

export function financeChatLocale(profileLocale?: string | null, telegramLocale?: string | null): FinanceChatLocale {
  return profileLocale && FINANCE_CHAT_LOCALES.includes(normalizeFinanceLocale(profileLocale))
    ? normalizeFinanceLocale(profileLocale)
    : normalizeFinanceLocale(telegramLocale);
}

export function t(locale: FinanceChatLocale, key: FinanceChatKey, values: Record<string, string | number> = {}) {
  const message = financeChatTranslations[locale][key] || en[key];
  return typeof message === 'function' ? message(values) : message;
}

const categoryLabels: Record<FinanceChatLocale, Record<string, string>> = {
  en: { food: 'Food', transport: 'Transport', fuel: 'Fuel', home: 'Home', subscriptions: 'Subscriptions', shopping: 'Shopping', health: 'Health', entertainment: 'Entertainment', other: 'Other', salary: 'Salary', 'other-income': 'Other income' },
  uk: { food: 'Їжа', transport: 'Транспорт', fuel: 'Пальне', home: 'Дім', subscriptions: 'Підписки', shopping: 'Покупки', health: 'Здоров’я', entertainment: 'Розваги', other: 'Інше', salary: 'Зарплата', 'other-income': 'Інші доходи' },
  ru: { food: 'Еда', transport: 'Транспорт', fuel: 'Топливо', home: 'Дом', subscriptions: 'Подписки', shopping: 'Покупки', health: 'Здоровье', entertainment: 'Развлечения', other: 'Другое', salary: 'Зарплата', 'other-income': 'Другие доходы' },
};

/** Default category keys are stable; only their presentation is localized. */
export function financeCategoryLabel(locale: FinanceChatLocale, key: string | null | undefined, fallback: string) {
  return (key && categoryLabels[locale][key]) || fallback;
}

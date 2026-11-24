import type { FinanceLocale } from "./core";

const chatCopy = {
  uk: {
    archive: "Архів", move: "Перемістити в архів", restore: "Відновити чат", remove: "Видалити чат", confirmRemove: "Видалити цей чат і його повідомлення?", noChats: "Поки немає чатів",
    chats: "Чати", create: "Новий чат", rename: "Перейменувати чат", name: "Назва чату",
    mode: "Тип чату", save: "Зберегти", cancel: "Скасувати",
    loading: "Завантажуємо чати…", loadError: "Не вдалося завантажити історію чату.",
    saveError: "Не вдалося зберегти чат.", earlier: "Попередні повідомлення",
    moreChats: "Більше чатів", empty: "Створи чат, щоб почати розмову.",
    GENERAL: "Загальний", ADVICE: "Поради", TRANSACTIONS: "Операції",
  },
  ru: {
    archive: "Архив", move: "Перенести в архив", restore: "Восстановить чат", remove: "Удалить чат", confirmRemove: "Удалить этот чат и его сообщения?", noChats: "Пока нет чатов",
    chats: "Чаты", create: "Новый чат", rename: "Переименовать чат", name: "Название чата",
    mode: "Тип чата", save: "Сохранить", cancel: "Отмена",
    loading: "Загружаем чаты…", loadError: "Не удалось загрузить историю чата.",
    saveError: "Не удалось сохранить чат.", earlier: "Предыдущие сообщения",
    moreChats: "Больше чатов", empty: "Создай чат, чтобы начать разговор.",
    GENERAL: "Общий", ADVICE: "Советы", TRANSACTIONS: "Операции",
  },
  en: {
    archive: "Archive", move: "Move to archive", restore: "Restore chat", remove: "Delete chat", confirmRemove: "Delete this chat and its messages?", noChats: "No chats yet",
    chats: "Chats", create: "New chat", rename: "Rename chat", name: "Chat name",
    mode: "Chat type", save: "Save", cancel: "Cancel",
    loading: "Loading chats…", loadError: "Couldn’t load the chat history.",
    saveError: "Couldn’t save the chat.", earlier: "Earlier messages",
    moreChats: "More chats", empty: "Create a chat to start a conversation.",
    GENERAL: "General", ADVICE: "Advice", TRANSACTIONS: "Transactions",
  },
};

export const groshlyAssistantChatCopy = (locale: FinanceLocale) => chatCopy[locale] ?? chatCopy.uk;

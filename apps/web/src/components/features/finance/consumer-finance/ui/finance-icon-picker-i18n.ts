import type { EmojiCategory } from "@/lib/emoji-icons";
import type { FinanceLocale } from "../i18n/core";

type FinanceIconPickerCopy = {
  addIcon: string;
  changeIcon: string;
  searchIcon: string;
  noStandardIcons: string;
  icons: string;
  image: string;
  remove: string;
  uploadImage: string;
  dropImage: string;
  uploadingImage: string;
  readyOnce: string;
  preview: string;
  useOnce: string;
  saveCustomIcon: string;
  iconName: string;
  iconNameExample: string;
  save: string;
  back: string;
  customIcons: string;
  noCustomIcons: string;
} & Record<EmojiCategory, string>;

const copy: Record<FinanceLocale, FinanceIconPickerCopy> = {
  en: {
    addIcon: "Add icon",
    changeIcon: "Change icon",
    searchIcon: "Search icon by name",
    noStandardIcons: "No standard icons found.",
    icons: "Icons",
    image: "Image",
    remove: "Remove",
    uploadImage: "Upload image",
    dropImage: "Drop or paste an image here",
    uploadingImage: "Uploading image…",
    readyOnce: "Ready to use once",
    preview: "Preview",
    useOnce: "Use once",
    saveCustomIcon: "Save for reuse",
    iconName: "Icon name",
    iconNameExample: "For example, My card",
    save: "Save icon",
    back: "Back to icons",
    customIcons: "Saved images",
    noCustomIcons: "No saved images yet.",
    people: "People",
    nature: "Nature",
    food: "Food",
    activity: "Activity",
    travel: "Travel",
    objects: "Objects",
    symbols: "Symbols",
    flags: "Flags",
  },
  uk: {
    addIcon: "Додати емодзі",
    changeIcon: "Змінити емодзі",
    searchIcon: "Пошук емодзі за назвою",
    noStandardIcons: "Стандартних емодзі не знайдено.",
    icons: "Емодзі",
    image: "Зображення",
    remove: "Прибрати",
    uploadImage: "Завантажити зображення",
    dropImage: "Перетягніть або вставте зображення сюди",
    uploadingImage: "Завантаження зображення…",
    readyOnce: "Готово до одноразового використання",
    preview: "Перегляд",
    useOnce: "Використати один раз",
    saveCustomIcon: "Зберегти для повторного використання",
    iconName: "Назва іконки",
    iconNameExample: "Наприклад, Моя картка",
    save: "Зберегти іконку",
    back: "Назад до емодзі",
    customIcons: "Збережені зображення",
    noCustomIcons: "Збережених зображень ще немає.",
    people: "Люди",
    nature: "Природа",
    food: "Їжа",
    activity: "Активності",
    travel: "Подорожі",
    objects: "Предмети",
    symbols: "Символи",
    flags: "Прапори",
  },
  ru: {
    addIcon: "Добавить эмодзи",
    changeIcon: "Изменить эмодзи",
    searchIcon: "Поиск эмодзи по названию",
    noStandardIcons: "Стандартные эмодзи не найдены.",
    icons: "Эмодзи",
    image: "Изображение",
    remove: "Убрать",
    uploadImage: "Загрузить изображение",
    dropImage: "Перетащите или вставьте изображение сюда",
    uploadingImage: "Загрузка изображения…",
    readyOnce: "Готово к одноразовому использованию",
    preview: "Предпросмотр",
    useOnce: "Использовать один раз",
    saveCustomIcon: "Сохранить для повторного использования",
    iconName: "Название иконки",
    iconNameExample: "Например, Моя карта",
    save: "Сохранить иконку",
    back: "Назад к эмодзи",
    customIcons: "Сохранённые изображения",
    noCustomIcons: "Сохранённых изображений пока нет.",
    people: "Люди",
    nature: "Природа",
    food: "Еда",
    activity: "Активности",
    travel: "Путешествия",
    objects: "Предметы",
    symbols: "Символы",
    flags: "Флаги",
  },
};

export function financeIconPickerCopy(locale: FinanceLocale) {
  return copy[locale];
}

import { financeCoreCopy, type FinanceLocale } from "./core";

const copy = {
  en: {
    categoriesHelp: "Categories help you see where your money goes.",
    expenseCategories: "Expense categories",
    incomeCategories: "Income categories",
    addCategory: "Add category",
    editCategory: "Edit category",
    categoryName: "Category name",
    parentCategory: "Parent category",
    noParent: "No parent category",
    noCategories: "No categories yet.",
    archivedCategories: "Archived categories",
    archivedCategoriesHelp:
      "Archived categories remain attached to historical transactions.",
    legacyCategories: "Legacy categories",
    legacyCategoriesHelp:
      "These categories have an unavailable or invalid parent and are shown safely.",
    legacyParent: "Parent relationship unavailable",
    categoryType: "Category type",
    archiveCategory: "Archive category",
    archiveCategoryDescription:
      "Historical transactions will keep this category.",
    categorySaveError:
      "Could not save the category. Check the fields and try again.",
    categoryLoadError: "Could not load categories.",
  },
  uk: {
    categoriesHelp: "Категорії допомагають зрозуміти, куди йдуть гроші.",
    expenseCategories: "Категорії витрат",
    incomeCategories: "Категорії доходів",
    addCategory: "Додати категорію",
    editCategory: "Редагувати категорію",
    categoryName: "Назва категорії",
    parentCategory: "Батьківська категорія",
    noParent: "Без батьківської категорії",
    noCategories: "Категорій ще немає.",
    archivedCategories: "Архівні категорії",
    archivedCategoriesHelp:
      "Архівні категорії залишаються у вже створених операціях.",
    legacyCategories: "Застарілі категорії",
    legacyCategoriesHelp:
      "Ці категорії мають недоступну або некоректну батьківську категорію.",
    legacyParent: "Батьківський зв’язок недоступний",
    categoryType: "Тип категорії",
    archiveCategory: "Архівувати категорію",
    archiveCategoryDescription: "Історичні операції збережуть цю категорію.",
    categorySaveError: "Не вдалося зберегти категорію. Перевірте поля.",
    categoryLoadError: "Не вдалося завантажити категорії.",
  },
  ru: {
    categoriesHelp: "Категории помогают понять, куда уходят деньги.",
    expenseCategories: "Категории расходов",
    incomeCategories: "Категории доходов",
    addCategory: "Добавить категорию",
    editCategory: "Редактировать категорию",
    categoryName: "Название категории",
    parentCategory: "Родительская категория",
    noParent: "Без родительской категории",
    noCategories: "Категорий пока нет.",
    archivedCategories: "Архивные категории",
    archivedCategoriesHelp:
      "Архивные категории остаются в уже созданных операциях.",
    legacyCategories: "Устаревшие категории",
    legacyCategoriesHelp:
      "У этих категорий недоступная или некорректная родительская категория.",
    legacyParent: "Родительская связь недоступна",
    categoryType: "Тип категории",
    archiveCategory: "Архивировать категорию",
    archiveCategoryDescription: "Исторические операции сохранят эту категорию.",
    categorySaveError: "Не удалось сохранить категорию. Проверьте поля.",
    categoryLoadError: "Не удалось загрузить категории.",
  },
} as const;

export const financeCategoriesCopy = (locale: FinanceLocale) => ({
  ...financeCoreCopy(locale),
  ...copy[locale],
});

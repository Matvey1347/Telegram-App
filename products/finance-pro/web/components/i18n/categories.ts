import { financeCoreCopy, type FinanceLocale } from "@finance-pro/web/components/i18n/core";

const copy = {
  en: {
    categoriesHelp: "Categories help you see where your money goes.",
    expenseCategories: "Expense categories",
    incomeCategories: "Income categories",
    addCategory: "Add category",
    editCategory: "Edit category",
    categoryName: "Category name",
    parentCategory: "Parent category",
    categoryRequired: "Required expense category",
    categoryRequiredHelp:
      "This choice is applied to every existing and new expense in this category.",
    noParent: "No parent category",
    noCategories: "No categories yet.",
    archivedCategories: "Archived categories",
    archivedCategoriesHelp:
      "Archived categories remain attached to historical transactions.",
    active: "Active",
    archived: "Archived",
    restoreCategory: "Restore category",
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
    categoryRequired: "Категорія обов’язкових витрат",
    categoryRequiredHelp:
      "Вибір застосовується до всіх наявних і нових витрат цієї категорії.",
    noParent: "Без батьківської категорії",
    noCategories: "Категорій ще немає.",
    archivedCategories: "Архівні категорії",
    archivedCategoriesHelp:
      "Архівні категорії залишаються у вже створених операціях.",
    active: "Активні",
    archived: "Архівні",
    restoreCategory: "Відновити категорію",
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
    categoryRequired: "Категория обязательных расходов",
    categoryRequiredHelp:
      "Выбор применяется ко всем существующим и новым расходам этой категории.",
    noParent: "Без родительской категории",
    noCategories: "Категорий пока нет.",
    archivedCategories: "Архивные категории",
    archivedCategoriesHelp:
      "Архивные категории остаются в уже созданных операциях.",
    active: "Активные",
    archived: "Архивные",
    restoreCategory: "Восстановить категорию",
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

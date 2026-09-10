import { Pencil, Trash2 } from "lucide-react";
import type {
  ConsumerFinanceCategory,
  ConsumerFinanceTransactionType,
} from "@telegram-system/shared";
import { Card, EmptyState } from "./ui";
import { type FinanceLocale } from "./i18n/core";
import { financeCategoriesCopy } from "./i18n/categories";
import { localizeFinanceCategory } from "./finance-category-i18n";
import { IconAvatar } from "./ui/finance-icon-avatar";

type LegacyReason =
  | "missing-parent"
  | "archived-parent"
  | "wrong-type-parent"
  | "cycle";

export type CategoryTreeNode = {
  category: ConsumerFinanceCategory;
  children: CategoryTreeNode[];
};

export type CategoryTreeGroup = {
  roots: CategoryTreeNode[];
  legacy: Array<{
    category: ConsumerFinanceCategory;
    reason: LegacyReason;
  }>;
};

/** Builds one type-specific forest in O(n), classifying every active row once. */
export function buildCategoryTree(
  categories: ConsumerFinanceCategory[],
  type: ConsumerFinanceTransactionType,
): CategoryTreeGroup {
  const allById = new Map(
    categories.map((category) => [category.id, category]),
  );
  const active = categories.filter(
    (category) => category.type === type && !category.archivedAt,
  );
  const activeById = new Map(active.map((category) => [category.id, category]));
  const state = new Map<string, 0 | 1 | 2>();
  const reasons = new Map<string, LegacyReason | null>();

  const resolveReason = (
    category: ConsumerFinanceCategory,
  ): LegacyReason | null => {
    const known = reasons.get(category.id);
    if (known !== undefined) return known;
    if (state.get(category.id) === 1) {
      reasons.set(category.id, "cycle");
      return "cycle";
    }
    state.set(category.id, 1);
    let reason: LegacyReason | null = null;
    if (category.parentId) {
      const parent = allById.get(category.parentId);
      if (!parent) reason = "missing-parent";
      else if (parent.archivedAt) reason = "archived-parent";
      else if (parent.type !== type) reason = "wrong-type-parent";
      else if (!activeById.has(parent.id)) reason = "missing-parent";
      else reason = resolveReason(parent);
    }
    state.set(category.id, 2);
    reasons.set(category.id, reason);
    return reason;
  };

  for (const category of active) resolveReason(category);

  const nodes = new Map<string, CategoryTreeNode>(
    active
      .filter((category) => reasons.get(category.id) === null)
      .map((category) => [category.id, { category, children: [] }]),
  );
  const roots: CategoryTreeNode[] = [];
  const legacy: CategoryTreeGroup["legacy"] = [];
  for (const category of active) {
    const reason = reasons.get(category.id);
    if (reason) {
      legacy.push({ category, reason });
      continue;
    }
    const node = nodes.get(category.id)!;
    const parent = category.parentId ? nodes.get(category.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return { roots, legacy };
}

export function categoryDescendantIds(
  categories: ConsumerFinanceCategory[],
  categoryId: string,
) {
  const children = new Map<string, string[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    const current = children.get(category.parentId) ?? [];
    current.push(category.id);
    children.set(category.parentId, current);
  }
  const descendants = new Set<string>();
  const queue = [...(children.get(categoryId) ?? [])];
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    if (descendants.has(id)) continue;
    descendants.add(id);
    queue.push(...(children.get(id) ?? []));
  }
  return descendants;
}

export function FinanceCategoryTree({
  type,
  categories,
  locale,
  onEdit,
  onArchive,
}: {
  type: ConsumerFinanceTransactionType;
  categories: ConsumerFinanceCategory[];
  locale: FinanceLocale;
  onEdit: (category: ConsumerFinanceCategory) => void;
  onArchive: (category: ConsumerFinanceCategory) => void;
}) {
  const t = financeCategoriesCopy(locale);
  const group = buildCategoryTree(categories, type);
  return (
    <Card>
      <h2 className="font-medium">
        {type === "EXPENSE" ? t.expenseCategories : t.incomeCategories}
      </h2>
      {group.roots.length ? (
        <div className="mt-2 space-y-2">
          {group.roots.map((node) => (
            <TreeNode
              key={node.category.id}
              node={node}
              locale={locale}
              depth={0}
              isLast={false}
              onEdit={onEdit}
              onArchive={onArchive}
            />
          ))}
        </div>
      ) : group.legacy.length ? null : (
        <EmptyState text={t.noCategories} />
      )}
      {group.legacy.length ? (
        <section
          aria-label={t.legacyCategories}
          className="mt-4 border-t border-amber-800/60 pt-3"
        >
          <h3 className="text-sm font-medium text-amber-200">
            {t.legacyCategories}
          </h3>
          <p className="mt-1 text-xs text-neutral-500">
            {t.legacyCategoriesHelp}
          </p>
          <div className="mt-2 divide-y divide-neutral-800">
            {group.legacy.map(({ category, reason }) => (
              <div key={category.id} data-category-id={category.id}>
                <CategoryRow
                  category={category}
                  locale={locale}
                  onEdit={onEdit}
                  onArchive={onArchive}
                />
                <span
                  className="pb-2 text-[11px] text-amber-300"
                  data-legacy-reason={reason}
                >
                  {t.legacyParent}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </Card>
  );
}

function TreeNode({
  node,
  locale,
  depth,
  isLast,
  onEdit,
  onArchive,
}: {
  node: CategoryTreeNode;
  locale: FinanceLocale;
  depth: number;
  isLast: boolean;
  onEdit: (category: ConsumerFinanceCategory) => void;
  onArchive: (category: ConsumerFinanceCategory) => void;
}) {
  return (
    <div
      data-category-id={node.category.id}
      data-category-depth={depth}
      className={
        depth === 0
          ? "rounded-lg border border-neutral-800 bg-neutral-950/40 px-3"
          : "relative"
      }
    >
      {depth > 0 ? (
        <>
          <span
            aria-hidden="true"
            data-category-connector-rail={node.category.id}
            className={`absolute -left-5 top-0 w-px bg-neutral-700 ${isLast ? "h-7" : "bottom-[-0.25rem]"}`}
          />
          <span
            aria-hidden="true"
            data-category-connector={node.category.id}
            className="absolute -left-5 top-[1.75rem] h-px w-5 bg-neutral-600"
          />
        </>
      ) : null}
      <CategoryRow
        category={node.category}
        locale={locale}
        onEdit={onEdit}
        onArchive={onArchive}
      />
      {node.children.length ? (
        <div
          className="relative ml-4 space-y-1 pb-2 pl-5"
          data-category-children={node.category.id}
        >
          {node.children.map((child, index) => (
            <TreeNode
              key={child.category.id}
              node={child}
              locale={locale}
              depth={depth + 1}
              isLast={index === node.children.length - 1}
              onEdit={onEdit}
              onArchive={onArchive}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CategoryRow({
  category,
  locale,
  onEdit,
  onArchive,
}: {
  category: ConsumerFinanceCategory;
  locale: FinanceLocale;
  onEdit: (category: ConsumerFinanceCategory) => void;
  onArchive: (category: ConsumerFinanceCategory) => void;
}) {
  const t = financeCategoriesCopy(locale);
  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <IconAvatar
          icon={category.iconPresentation}
          label={category.name}
          size="sm"
          bordered={false}
        />
        <p className="truncate">
          {localizeFinanceCategory(category.name, category.key, locale)}
        </p>
      </div>
      <div className="flex shrink-0">
        <button
          aria-label={`${t.editCategory}: ${category.name}`}
          className="flex min-h-11 min-w-11 items-center justify-center rounded text-neutral-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
          onClick={() => onEdit(category)}
        >
          <Pencil size={16} />
        </button>
        <button
          aria-label={`${t.archiveCategory}: ${category.name}`}
          className="flex min-h-11 min-w-11 items-center justify-center rounded text-rose-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
          onClick={() => onArchive(category)}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

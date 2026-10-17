"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RotateCcw } from "lucide-react";
import type {
  ConsumerFinanceCategory,
  ConsumerFinanceExpenseNecessity,
  ConsumerFinanceTransactionType,
} from "@telegram-system/shared";
import {
  Button,
  Card,
  ErrorState,
  FinanceNecessityToggle,
  FormField,
  Input,
  LoadingState,
  Modal,
  Select,
} from "@finance-pro/web/components/ui";
import { IconAvatar } from "@finance-pro/web/components/ui/finance-icon-avatar";
import { consumerFinanceApi } from "@finance-pro/web/lib/api/consumer-finance-api";
import { consumerFinanceKeys } from "@finance-pro/web/lib/query/consumer-finance-query-keys";
import { type FinanceLocale } from "@finance-pro/web/components/i18n/core";
import { financeCategoriesCopy } from "@finance-pro/web/components/i18n/categories";
import { localizeFinanceCategory } from "@finance-pro/web/components/catalog/finance-category-i18n";
import { FinanceConfirmModal } from "@finance-pro/web/components/shared/finance-confirm-modal";
import { IconPicker } from "@finance-pro/web/components/ui/finance-icon-picker";
import {
  categoryDescendantIds,
  FinanceCategoryTree,
} from "@finance-pro/web/components/catalog/finance-category-tree";

export function FinanceCategories({
  botId,
  locale,
}: {
  botId: string;
  locale: FinanceLocale;
}) {
  const t = financeCategoriesCopy(locale);
  const client = useQueryClient();
  const [editing, setEditing] = useState<ConsumerFinanceCategory | null>(null);
  const [archiving, setArchiving] = useState<ConsumerFinanceCategory | null>(
    null,
  );
  const [type, setType] = useState<ConsumerFinanceTransactionType>("EXPENSE");
  const [status, setStatus] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const categories = useQuery({
    queryKey: consumerFinanceKeys.categories(botId),
    queryFn: () => consumerFinanceApi.categories(botId),
  });
  const reconcile = (item: ConsumerFinanceCategory) =>
    client.setQueryData(
      consumerFinanceKeys.categories(botId),
      (rows: ConsumerFinanceCategory[] | undefined) => {
        const current = rows ?? [];
        return current.some((row) => row.id === item.id)
          ? current.map((row) => (row.id === item.id ? item : row))
          : [...current, item];
      },
    );
  const archive = useMutation({
    mutationFn: (id: string) => consumerFinanceApi.archiveCategory(botId, id),
    onSuccess: (item) => {
      reconcile(item);
      setArchiving(null);
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.dashboard(botId),
      });
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.analyticsRoot(botId),
      });
    },
  });
  const restore = useMutation({
    mutationFn: (id: string) => consumerFinanceApi.restoreCategory(botId, id),
    onSuccess: (item) => {
      reconcile(item);
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.dashboard(botId),
      });
      void client.invalidateQueries({
        queryKey: consumerFinanceKeys.analyticsRoot(botId),
      });
    },
  });
  if (categories.isLoading) return <LoadingState text={t.loading} />;
  if (categories.isError)
    return (
      <div className="space-y-3">
        <ErrorState text={t.categoryLoadError} />
        <Button onClick={() => categories.refetch()}>{t.retry}</Button>
      </div>
    );
  const rows = categories.data ?? [];
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-400">{t.categoriesHelp}</p>
      <CategoryEditor
        key={editing?.id ?? "create-category"}
        botId={botId}
        categories={rows}
        editing={editing}
        locale={locale}
        onClose={() => setEditing(null)}
        onSaved={(item) => {
          reconcile(item);
          setEditing(null);
          // Transaction rows and search membership include the category name.
          void client.invalidateQueries({
            queryKey: consumerFinanceKeys.transactionLists(botId),
          });
          void client.invalidateQueries({
            queryKey: consumerFinanceKeys.dashboard(botId),
          });
          void client.invalidateQueries({
            queryKey: consumerFinanceKeys.analyticsRoot(botId),
          });
        }}
      />
      <section className="grid grid-cols-2 gap-3" aria-label={t.categoryType}>
        <div className="space-y-1">
          <p className="text-sm text-neutral-300">{t.categoryType}</p>
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-neutral-800 bg-neutral-950/40 p-1">
            <Button
              variant={type === "EXPENSE" ? "primary" : "outline"}
              className="px-2"
              onClick={() => setType("EXPENSE")}
            >
              {t.expense}
            </Button>
            <Button
              variant={type === "INCOME" ? "primary" : "outline"}
              className="px-2"
              onClick={() => setType("INCOME")}
            >
              {t.income}
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-neutral-300">{t.archivedCategories}</p>
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-neutral-800 bg-neutral-950/40 p-1">
            <Button
              variant={status === "ACTIVE" ? "primary" : "outline"}
              className="px-2"
              onClick={() => setStatus("ACTIVE")}
            >
              {t.active}
            </Button>
            <Button
              variant={status === "ARCHIVED" ? "primary" : "outline"}
              className="px-2"
              onClick={() => setStatus("ARCHIVED")}
            >
              {t.archived}
            </Button>
          </div>
        </div>
      </section>
      {status === "ACTIVE" ? (
        <FinanceCategoryTree
          type={type}
          categories={rows}
          locale={locale}
          onEdit={setEditing}
          onArchive={setArchiving}
        />
      ) : (
        <ArchivedCategoryList
          categories={rows.filter(
            (item) => item.type === type && Boolean(item.archivedAt),
          )}
          locale={locale}
          restoringId={restore.variables ?? null}
          onRestore={(item) => restore.mutate(item.id)}
        />
      )}
      <FinanceConfirmModal
        open={!!archiving}
        locale={locale}
        onClose={() => setArchiving(null)}
        onConfirm={() =>
          archiving ? archive.mutateAsync(archiving.id) : Promise.resolve()
        }
        entityName={archiving?.name ?? ""}
        actionLabel={t.archive}
        description={t.archiveCategoryDescription}
      />
    </div>
  );
}

function CategoryEditor({
  botId,
  categories,
  editing,
  locale,
  onClose,
  onSaved,
}: {
  botId: string;
  categories: ConsumerFinanceCategory[];
  editing: ConsumerFinanceCategory | null;
  locale: FinanceLocale;
  onClose: () => void;
  onSaved: (item: ConsumerFinanceCategory) => void;
}) {
  const t = financeCategoriesCopy(locale);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(editing?.name ?? "");
  const [type, setType] = useState<ConsumerFinanceTransactionType>(
    editing?.type ?? "EXPENSE",
  );
  const [parentId, setParentId] = useState(editing?.parentId ?? "");
  const [necessity, setNecessity] = useState<ConsumerFinanceExpenseNecessity>(
    editing?.necessity ?? "DISCRETIONARY",
  );
  const [iconSource, setIconSource] = useState<string | null>(
    editing?.iconPresentation.type === "image"
      ? `image:${editing.iconPresentation.url}`
      : (editing?.iconPresentation.value ?? "🏷️"),
  );
  const mutation = useMutation({
    mutationFn: () =>
      editing
        ? consumerFinanceApi.updateCategory(botId, editing.id, {
            name: name.trim(),
            emoji: iconSource,
            type,
            parentId: parentId || null,
            necessity,
          })
        : consumerFinanceApi.createCategory(botId, {
            name: name.trim(),
            emoji: iconSource,
            type,
            parentId: parentId || undefined,
            necessity,
          }),
    onSuccess: (item) => {
      onSaved(item);
      setOpen(false);
      setName("");
      setParentId("");
    },
  });
  const descendants = editing
    ? categoryDescendantIds(categories, editing.id)
    : new Set<string>();
  return (
    <>
      <Button
        className="w-full"
        onClick={() => setOpen(true)}
      >
        <Plus size={16} aria-hidden="true" />
        {t.addCategory}
      </Button>
      <Modal
        open={open || !!editing}
        closeLabel={t.close}
        onClose={() => {
          setOpen(false);
          onClose();
        }}
        title={editing ? t.editCategory : t.addCategory}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <IconPicker
              botId={botId}
              uiLocale={locale}
              source={iconSource}
              onChange={setIconSource}
              buttonLabel={name.trim() || t.categoryName}
            />
          </div>
          <FormField label={t.categoryName}>
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>
          <FormField label={t.categoryType}>
            <Select
              uiLocale={locale}
              value={type}
              onChange={(event) => {
                setType(event.target.value as ConsumerFinanceTransactionType);
                setParentId("");
              }}
            >
              <option value="EXPENSE">{t.expense}</option>
              <option value="INCOME">{t.income}</option>
            </Select>
          </FormField>
          {type === "EXPENSE" ? (
            <FinanceNecessityToggle
              value={necessity}
              locale={locale}
              onChange={setNecessity}
              label={t.categoryRequired}
              help={t.categoryRequiredHelp}
              className="sm:col-span-2"
            />
          ) : null}
          <FormField label={t.parentCategory}>
            <Select
              uiLocale={locale}
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="">{t.noParent}</option>
              {categories
                .filter(
                  (item) =>
                    item.type === type &&
                    item.id !== editing?.id &&
                    !descendants.has(item.id) &&
                    (!item.archivedAt || item.id === editing?.parentId),
                )
                .map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                    data-icon-emoji={
                      item.iconPresentation.type === "unicode"
                        ? item.iconPresentation.value
                        : undefined
                    }
                  >
                    {localizeFinanceCategory(item.name, item.key, locale)}
                  </option>
                ))}
            </Select>
          </FormField>
          <Button
            className="w-full sm:col-span-2"
            disabled={!name.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t.saving : t.save}
          </Button>
          {mutation.isError ? (
            <p className="text-sm text-rose-300 sm:col-span-2">
              {t.categorySaveError}
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

function ArchivedCategoryList({
  categories,
  locale,
  restoringId,
  onRestore,
}: {
  categories: ConsumerFinanceCategory[];
  locale: FinanceLocale;
  restoringId: string | null;
  onRestore: (category: ConsumerFinanceCategory) => void;
}) {
  const t = financeCategoriesCopy(locale);
  return (
    <Card>
      <h2 className="font-medium">{t.archivedCategories}</h2>
      <p className="mt-1 text-xs text-neutral-500">{t.archivedCategoriesHelp}</p>
      {categories.length ? (
        <div className="mt-3 divide-y divide-neutral-800">
          {categories.map((category) => (
            <div
              className="flex items-center justify-between gap-3 py-2"
              key={category.id}
              data-archived-category-id={category.id}
            >
              <div className="flex min-w-0 items-center gap-2">
                <IconAvatar
                  icon={category.iconPresentation}
                  label={category.name}
                  size="sm"
                  bordered={false}
                />
                <span className="truncate text-sm">
                  {localizeFinanceCategory(category.name, category.key, locale)}
                </span>
              </div>
              <Button
                variant="outline"
                className="shrink-0 px-3"
                disabled={restoringId === category.id}
                onClick={() => onRestore(category)}
              >
                <RotateCcw size={16} aria-hidden="true" />
                {t.restoreCategory}
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-neutral-500">{t.noCategories}</p>
      )}
    </Card>
  );
}

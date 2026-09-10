"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import type {
  ConsumerFinanceCategory,
  ConsumerFinanceTransactionType,
} from "@telegram-system/shared";
import {
  Button,
  Card,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Modal,
  Select,
} from "./ui";
import { consumerFinanceApi } from "@/lib/features/finance/consumer-finance-api";
import { consumerFinanceKeys } from "@/lib/features/finance/consumer-finance-query-keys";
import { type FinanceLocale } from "./i18n/core";
import { financeCategoriesCopy } from "./i18n/categories";
import { localizeFinanceCategory } from "./finance-category-i18n";
import { FinanceConfirmModal } from "./finance-confirm-modal";
import { IconPicker } from "./ui/finance-icon-picker";
import {
  categoryDescendantIds,
  FinanceCategoryTree,
} from "./finance-category-tree";

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
      {(["EXPENSE", "INCOME"] as const).map((type) => (
        <FinanceCategoryTree
          key={type}
          type={type}
          categories={rows}
          locale={locale}
          onEdit={setEditing}
          onArchive={setArchiving}
        />
      ))}
      {rows.some((item) => item.archivedAt) ? (
        <Card>
          <h2 className="font-medium">{t.archivedCategories}</h2>
          <p className="mt-1 text-xs text-neutral-500">
            {t.archivedCategoriesHelp}
          </p>
          <div className="mt-3 divide-y divide-neutral-800">
            {rows
              .filter((item) => item.archivedAt)
              .map((item) => (
                <div
                  className="flex justify-between gap-3 py-2 text-sm text-neutral-400"
                  key={item.id}
                  data-archived-category-id={item.id}
                >
                  <span className="truncate">
                    {localizeFinanceCategory(item.name, item.key, locale)}
                  </span>
                  <span>{item.type === "EXPENSE" ? t.expense : t.income}</span>
                </div>
              ))}
          </div>
        </Card>
      ) : null}
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
  const [emoji, setEmoji] = useState(
    editing?.iconPresentation.type === "unicode"
      ? editing.iconPresentation.value
      : "🏷️",
  );
  const mutation = useMutation({
    mutationFn: () =>
      editing
        ? consumerFinanceApi.updateCategory(botId, editing.id, {
            name: name.trim(),
            emoji,
            type,
            parentId: parentId || null,
          })
        : consumerFinanceApi.createCategory(botId, {
            name: name.trim(),
            emoji,
            type,
            parentId: parentId || undefined,
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
        className="min-h-10 self-start px-3"
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
        <div className="space-y-3">
          <IconPicker
            uiLocale={locale}
            icon={{ type: "unicode", value: emoji }}
            iconId={null}
            onChange={() => undefined}
            onEmojiChange={(value) => value && setEmoji(value)}
            allowImages={false}
            buttonLabel={t.categoryName}
          />
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
                  <option key={item.id} value={item.id}>
                    {localizeFinanceCategory(item.name, item.key, locale)}
                  </option>
                ))}
            </Select>
          </FormField>
          <Button
            className="w-full"
            disabled={!name.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t.saving : t.save}
          </Button>
          {mutation.isError ? (
            <p className="text-sm text-rose-300">{t.categorySaveError}</p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

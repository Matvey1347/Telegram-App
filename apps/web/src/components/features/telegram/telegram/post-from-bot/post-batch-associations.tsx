"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Link2, LoaderCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type {
  LinkTelegramPostBatchPayload,
  TelegramPostBatch,
  TelegramPostBatchAssociation,
} from "@telegram-system/shared";
import { Button, CustomSelect, FormField } from "@/components/ui/primitives";
import { telegramPostBatchKeys } from "@/lib/query-keys";
import { telegramPostBatchesApi } from "@/lib/features/telegram/telegram-post-batches-api";
import { useI18n } from "@/providers/i18n-provider";

export function PostBatchAssociations({
  batch,
  linking,
  onLink,
}: {
  batch: TelegramPostBatch;
  linking: boolean;
  onLink: (payload: LinkTelegramPostBatchPayload) => Promise<void>;
}) {
  const { locale, t } = useI18n();
  const [type, setType] =
    useState<TelegramPostBatchAssociation["type"]>("AD_SALE");
  const [entityId, setEntityId] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const targets = useQuery({
    queryKey: telegramPostBatchKeys.linkTargets(type),
    queryFn: () => telegramPostBatchesApi.linkTargets(type),
    enabled: open,
  });

  const attach = async () => {
    if (!entityId) return;
    setError("");
    try {
      await onLink({ type, entityId });
      setEntityId("");
    } catch {
      setError(t("telegram.posts.batch.attachError"));
    }
  };

  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span>
          <span className="block font-medium text-white">
            {t("telegram.posts.batch.associations")}
          </span>
          <span className="block text-xs text-neutral-500">
            {t("telegram.posts.batch.associationsHint")}
          </span>
        </span>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {batch.associations.length ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {batch.associations.map((association) => (
            <span
              key={association.id}
              className="rounded-full border border-blue-900/70 bg-blue-950/30 px-2.5 py-1 text-xs text-blue-200"
            >
              {association.title}
            </span>
          ))}
        </div>
      ) : null}
      {open ? (
        <div className="mt-3 grid gap-2 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-end">
          <FormField label={t("telegram.posts.batch.associationType")}>
            <CustomSelect
              uiLocale={locale}
              searchable={false}
              value={type}
              options={[
                {
                  value: "AD_SALE",
                  label: t("telegram.posts.batch.adSale"),
                },
                {
                  value: "MUTUAL_PROMOTION_FOLDER",
                  label: t("telegram.posts.batch.mutualPromotion"),
                },
              ]}
              onChange={(value) => {
                setType(value as TelegramPostBatchAssociation["type"]);
                setEntityId("");
                setError("");
              }}
            />
          </FormField>
          <FormField label={t("telegram.posts.batch.associationTarget")}>
            <CustomSelect
              uiLocale={locale}
              value={entityId}
              disabled={targets.isLoading || linking}
              options={(targets.data ?? []).map((target) => ({
                value: target.entityId,
                label: target.title,
                meta: target.subtitle ?? undefined,
              }))}
              placeholder={
                targets.isLoading
                  ? t("telegram.posts.batch.loadingTargets")
                  : t("telegram.posts.batch.chooseTarget")
              }
              onChange={setEntityId}
            />
          </FormField>
          <Button
            type="button"
            variant="secondary"
            disabled={!entityId || linking}
            onClick={() => void attach()}
          >
            {linking ? (
              <LoaderCircle size={16} className="animate-spin" />
            ) : (
              <Link2 size={16} />
            )}
            {t("telegram.posts.batch.attach")}
          </Button>
        </div>
      ) : null}
      {targets.error ? (
        <p role="alert" className="mt-2 text-xs text-rose-300">
          {t("telegram.posts.batch.targetsError")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-xs text-rose-300">
          {error}
        </p>
      ) : null}
    </section>
  );
}

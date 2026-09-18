"use client";

import { useState } from "react";
import type {
  TelegramUnifiedImportManifest,
  TelegramUnifiedImportPreviewItem,
  TelegramUnifiedImportSectionResult,
} from "@telegram-system/shared";
import { Trash2 } from "lucide-react";
import { IconPicker } from "@/components/icons/icon-picker";
import { FormField, Input, Select, Textarea } from "@/components/ui/primitives";
import { useI18n } from "@/providers/i18n-provider";
import {
  CONTENT_HYPOTHESIS_STATUS_TONE,
  CONTENT_HYPOTHESIS_STATUSES,
} from "./content-hypothesis-status";
import { importIconPresentation } from "./managed-posts-import-model";
import {
  ImportStateBadge,
  UnifiedImportStateTabs,
  type UnifiedImportState,
} from "./unified-import-state-tabs";
import { UnifiedImportItemChanges } from "./unified-import-item-changes";

export function UnifiedImportGroupsPreview({
  operation,
  manifest,
  disabled,
  failures = [],
  previewItems = [],
  onChange,
  onRemove,
}: EditorProps) {
  const { t } = useI18n();
  const [state, setState] = useState<UnifiedImportState>("pending");
  const visibleRefs = new Set(previewItems.map((item) => item.ref));
  const items = (manifest.groups ?? []).flatMap((group, index) =>
    group.action === operation && visibleRefs.has(group.ref)
      ? [{ group, index }]
      : [],
  );
  return (
    <div>
      <UnifiedImportStateTabs
        value={state}
        pendingCount={items.filter(({ group }) => !group.imported).length}
        importedCount={items.filter(({ group }) => group.imported).length}
        onChange={setState}
      />
      <div className="grid gap-3 lg:grid-cols-2">
        {items
          .filter(
            ({ group }) => Boolean(group.imported) === (state === "imported"),
          )
          .map(({ group, index }) => (
            <article
              key={group.ref}
              className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ActionBadge action={group.action} />
                  <ImportStateBadge imported={group.imported} />
                </div>
                <RemoveImportItemButton
                  disabled={disabled}
                  onClick={() => onRemove(group.ref)}
                />
              </div>
              <UnifiedImportItemChanges
                item={previewItems.find((item) => item.ref === group.ref)}
              />
              <div className="mt-3 grid gap-2 sm:grid-cols-[36px_minmax(0,1fr)]">
                <EmojiField
                  value={group.icon}
                  disabled={disabled || group.action === "DELETE"}
                  onChange={(icon) => {
                    const groups = [...(manifest.groups ?? [])];
                    groups[index] = { ...group, icon };
                    onChange({ ...manifest, groups });
                  }}
                />
                <FormField label={t("telegram.posts.import.titleField")}>
                  <Input
                    value={group.title ?? ""}
                    disabled={disabled || group.action === "DELETE"}
                    onChange={(event) => {
                      const groups = [...(manifest.groups ?? [])];
                      groups[index] = { ...group, title: event.target.value };
                      onChange({ ...manifest, groups });
                    }}
                  />
                </FormField>
              </div>
              {failures.find((failure) => failure.ref === group.ref)?.error ? (
                <p className="mt-3 rounded-md border border-rose-900/70 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
                  {failures.find((failure) => failure.ref === group.ref)!.error}
                </p>
              ) : null}
            </article>
          ))}
      </div>
    </div>
  );
}

export function UnifiedImportHypothesesPreview({
  operation,
  manifest,
  disabled,
  failures = [],
  previewItems = [],
  onChange,
  onRemove,
}: EditorProps) {
  const { t } = useI18n();
  const [state, setState] = useState<UnifiedImportState>("pending");
  const visibleRefs = new Set(previewItems.map((item) => item.ref));
  const items = (manifest.hypotheses ?? []).flatMap((hypothesis, index) =>
    !visibleRefs.has(hypothesis.ref)
      ? []
      : operation === "CREATE"
        ? hypothesis.action === "CREATE"
          ? [{ hypothesis, index }]
          : []
        : hypothesis.action === "UPDATE" || hypothesis.action === "ARCHIVE"
          ? [{ hypothesis, index }]
          : [],
  );
  return (
    <div>
      <UnifiedImportStateTabs
        value={state}
        pendingCount={
          items.filter(({ hypothesis }) => !hypothesis.imported).length
        }
        importedCount={
          items.filter(({ hypothesis }) => hypothesis.imported).length
        }
        onChange={setState}
      />
      <div className="grid gap-3 lg:grid-cols-2">
        {items
          .filter(
            ({ hypothesis }) =>
              Boolean(hypothesis.imported) === (state === "imported"),
          )
          .map(({ hypothesis, index }) => {
            const locked =
              disabled || ["ARCHIVE", "DELETE"].includes(hypothesis.action);
            const update = (patch: Record<string, unknown>) => {
              const hypotheses = [...(manifest.hypotheses ?? [])];
              hypotheses[index] = {
                ...hypothesis,
                value: {
                  name: hypothesis.value?.name ?? "",
                  ...hypothesis.value,
                  ...patch,
                },
              };
              onChange({ ...manifest, hypotheses });
            };
            return (
              <article
                key={hypothesis.ref}
                className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ActionBadge action={hypothesis.action} />
                    <ImportStateBadge imported={hypothesis.imported} />
                  </div>
                  <RemoveImportItemButton
                    disabled={disabled}
                    onClick={() => onRemove(hypothesis.ref)}
                  />
                </div>
                <UnifiedImportItemChanges
                  item={previewItems.find(
                    (item) => item.ref === hypothesis.ref,
                  )}
                />
                <div className="mt-3 grid gap-2 sm:grid-cols-[36px_minmax(0,1fr)]">
                  <EmojiField
                    value={hypothesis.icon}
                    disabled={locked}
                    onChange={(icon) => {
                      const hypotheses = [...(manifest.hypotheses ?? [])];
                      hypotheses[index] = { ...hypothesis, icon };
                      onChange({ ...manifest, hypotheses });
                    }}
                  />
                  <FormField label={t("telegram.posts.hypotheses.name")}>
                    <Input
                      value={hypothesis.value?.name ?? ""}
                      disabled={locked}
                      onChange={(event) => update({ name: event.target.value })}
                    />
                  </FormField>
                </div>
                <div className="mt-3 space-y-3">
                  <FormField label={t("telegram.posts.hypotheses.description")}>
                    <Textarea
                      rows={3}
                      value={hypothesis.value?.description ?? ""}
                      disabled={locked}
                      onChange={(event) =>
                        update({ description: event.target.value })
                      }
                    />
                  </FormField>
                  <FormField label={t("telegram.posts.hypotheses.status")}>
                    <Select
                      value={hypothesis.value?.status ?? "ACTIVE"}
                      disabled={locked}
                      className={
                        CONTENT_HYPOTHESIS_STATUS_TONE[
                          hypothesis.value?.status ?? "ACTIVE"
                        ]
                      }
                      onChange={(event) =>
                        update({ status: event.target.value })
                      }
                    >
                      {CONTENT_HYPOTHESIS_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {t(`telegram.posts.hypotheses.status.${status}`)}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label={t("telegram.posts.import.conclusion")}>
                    <Textarea
                      rows={2}
                      value={hypothesis.value?.conclusion ?? ""}
                      disabled={locked}
                      onChange={(event) =>
                        update({ conclusion: event.target.value || null })
                      }
                    />
                  </FormField>
                </div>
                {failures.find((failure) => failure.ref === hypothesis.ref)
                  ?.error ? (
                  <p className="mt-3 rounded-md border border-rose-900/70 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
                    {
                      failures.find(
                        (failure) => failure.ref === hypothesis.ref,
                      )!.error
                    }
                  </p>
                ) : null}
              </article>
            );
          })}
      </div>
    </div>
  );
}

type EditorProps = {
  operation: "CREATE" | "UPDATE";
  manifest: TelegramUnifiedImportManifest;
  disabled: boolean;
  failures?: TelegramUnifiedImportSectionResult["failed"];
  previewItems?: TelegramUnifiedImportPreviewItem[];
  onChange: (manifest: TelegramUnifiedImportManifest) => void;
  onRemove: (ref: string) => void;
};

function RemoveImportItemButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-rose-900/70 p-1.5 text-rose-300 transition hover:bg-rose-950 disabled:opacity-50"
      aria-label={t("telegram.posts.import.removeOperation")}
    >
      <Trash2 size={14} />
    </button>
  );
}

function EmojiField({
  value,
  disabled,
  onChange,
}: {
  value?: string | null;
  disabled: boolean;
  onChange: (icon: string | null) => void;
}) {
  const { t } = useI18n();
  const presentation = importIconPresentation(value ?? "");
  return (
    <FormField label={t("telegram.posts.hypotheses.icon")}>
      <IconPicker
        compact
        allowImages={false}
        disabled={disabled}
        iconId={value && !presentation ? value : null}
        icon={presentation}
        onChange={(icon) => onChange(icon)}
        onEmojiChange={(icon) => onChange(icon)}
        buttonLabel={t("telegram.posts.icon.addEmoji")}
        className="!h-9 !w-9"
        iconClassName="!h-6 !w-6 !bg-transparent"
      />
    </FormField>
  );
}

export function ActionBadge({ action }: { action: string }) {
  const tone =
    action === "CREATE" || action === "SCHEDULE"
      ? "bg-emerald-950 text-emerald-200 border-emerald-800"
      : action === "DELETE" || action === "UNSCHEDULE"
        ? "bg-rose-950 text-rose-200 border-rose-800"
        : action === "ARCHIVE"
          ? "bg-amber-950 text-amber-200 border-amber-800"
          : "bg-blue-950 text-blue-200 border-blue-800";
  return (
    <span
      className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-semibold ${tone}`}
    >
      {action}
    </span>
  );
}

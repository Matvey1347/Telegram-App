"use client";

import type { TelegramUnifiedImportManifest } from "@telegram-system/shared";
import { IconPicker } from "@/components/icons/icon-picker";
import { FormField, Input, Select, Textarea } from "@/components/ui/primitives";
import { useI18n } from "@/providers/i18n-provider";
import {
  CONTENT_HYPOTHESIS_STATUS_TONE,
  CONTENT_HYPOTHESIS_STATUSES,
} from "./content-hypothesis-status";
import { importIconPresentation } from "./managed-posts-import-model";

export function UnifiedImportGroupsPreview({
  operation,
  manifest,
  disabled,
  onChange,
}: EditorProps) {
  const { t } = useI18n();
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {(manifest.groups ?? [])
        .flatMap((group, index) =>
          group.action === operation ? [{ group, index }] : [],
        )
        .map(({ group, index }) => (
          <article
            key={group.ref}
            className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3"
          >
            <ActionBadge action={group.action} />
            <div className="mt-3 grid gap-2 sm:grid-cols-[48px_minmax(0,1fr)]">
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
          </article>
        ))}
    </div>
  );
}

export function UnifiedImportHypothesesPreview({
  operation,
  manifest,
  disabled,
  onChange,
}: EditorProps) {
  const { t } = useI18n();
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {(manifest.hypotheses ?? [])
        .flatMap((hypothesis, index) =>
          operation === "CREATE"
            ? hypothesis.action === "CREATE"
              ? [{ hypothesis, index }]
              : []
            : hypothesis.action === "UPDATE" || hypothesis.action === "ARCHIVE"
              ? [{ hypothesis, index }]
              : [],
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
              <ActionBadge action={hypothesis.action} />
              <div className="mt-3 grid gap-2 sm:grid-cols-[48px_minmax(0,1fr)]">
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
                    onChange={(event) => update({ status: event.target.value })}
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
            </article>
          );
        })}
    </div>
  );
}

type EditorProps = {
  operation: "CREATE" | "UPDATE";
  manifest: TelegramUnifiedImportManifest;
  disabled: boolean;
  onChange: (manifest: TelegramUnifiedImportManifest) => void;
};

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

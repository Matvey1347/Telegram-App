"use client";


import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, LoaderCircle, Upload } from "lucide-react";
import { Button, Modal } from "@/components/ui/primitives";
import { telegramChannelsApi, workspaceMembersApi } from "@/lib/api";
import { memberKeys } from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";
import { useI18n } from "@/providers/i18n-provider";
import { ManagedPostsImportSource } from "./managed-posts-import-source";
import {
  parsePostGroupImportContent,
  postGroupsGptPrompt,
} from "./post-groups-import-model";
import {
  ChannelImportNavigation,
  type ChannelImportMode,
} from "./channel-import-navigation";

export function PostGroupsImportModal({
  open,
  channelId,
  onClose,
  onImported,
  mode,
  onModeChange,
}: {
  open: boolean;
  channelId: string;
  onClose: () => void;
  onImported: () => Promise<void>;
  mode: ChannelImportMode;
  onModeChange: (mode: ChannelImportMode) => void;
}) {
  const { locale, t } = useI18n();
  const { pushToast, startOperation } = useAppToast();
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const members = useQuery({
    queryKey: memberKeys.membersSelect(),
    queryFn: () => workspaceMembersApi.select(),
    enabled: open,
  });
  const parsed = useMemo(() => {
    if (!content.trim()) return { rows: [], error: "" };
    try {
      return { rows: parsePostGroupImportContent(content), error: "" };
    } catch (parseError) {
      return {
        rows: [],
        error:
          parseError instanceof Error
            ? parseError.message
            : t("telegram.posts.import.parseGroupsError"),
      };
    }
  }, [content, t]);
  const knownMemberIds = new Set(
    (members.data || []).map((member) => member.id),
  );
  const unknownMember = parsed.rows.find(
    (row) =>
      row.createdByMemberId && !knownMemberIds.has(row.createdByMemberId),
  );
  const validationError =
    error ||
    parsed.error ||
    (unknownMember
      ? t("telegram.posts.import.memberMissing", { id: unknownMember.createdByMemberId })
      : "");

  const reset = () => {
    setContent("");
    setFileName(null);
    setError("");
  };
  const readFile = async (file: File) => {
    try {
      setContent(await file.text());
      setFileName(file.name);
      setError("");
    } catch {
      setError(t("telegram.posts.support.fileReadError"));
    }
  };
  const prompt = postGroupsGptPrompt(
    (members.data || []).map((member) => ({
      id: member.id,
      name: member.user.name,
    })),
  );

  return (
    <Modal open={open} onClose={onClose} title={t("telegram.posts.support.channelImport")} size="xl">
      <div className="space-y-4">
        <ChannelImportNavigation
          value={mode}
          onChange={onModeChange}
          disabled={importing}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">{t("telegram.posts.support.importGroups")}</h3>
            <p className="mt-0.5 text-xs text-neutral-400">
              {t("telegram.posts.import.groupHint")}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={importing}
            onClick={async () => {
              await navigator.clipboard.writeText(prompt);
              pushToast(t("telegram.posts.support.promptCopied"), "success");
            }}
          >
            <ClipboardList size={15} /> {t("telegram.posts.import.prompt")}
          </Button>
        </div>
        <ManagedPostsImportSource
          content={content}
          fileName={fileName}
          disabled={importing}
          onContent={(value) => {
            setContent(value);
            setFileName(null);
            setError("");
          }}
          onFile={(file) => void readFile(file)}
          onClear={reset}
          onCopyContent={() => void navigator.clipboard.writeText(content)}
        />
        {validationError ? (
          <p className="rounded-lg border border-rose-800/70 bg-rose-950/30 px-3 py-2 text-sm text-rose-200">
            {validationError}
          </p>
        ) : null}
        {parsed.rows.length && !validationError ? (
          <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-950 p-2">
            {parsed.rows.map((row, index) => {
              const member = members.data?.find(
                (item) => item.id === row.createdByMemberId,
              );
              return (
                <div
                  key={`${row.title}:${index}`}
                  className="flex items-center gap-3 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2"
                >
                  <span className="text-lg">{row.icon || "◌"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {row.title}
                    </p>
                    <p className="truncate text-xs text-neutral-500">
                      {member?.user.name || t("telegram.posts.import.currentMember")}
                      {row.description ? ` · ${row.description}` : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-neutral-500">
            {t("telegram.posts.import.groupJsonHint")}
          </p>
          <Button
            type="button"
            disabled={
              importing || !parsed.rows.length || Boolean(validationError)
            }
            onClick={async () => {
              setImporting(true);
              setError("");
              const operation = startOperation({
                id: `post-groups-import:${channelId}`,
                title: t("telegram.posts.import.groupOperation"),
                message: t("telegram.posts.import.starting"),
                current: 0,
                total: parsed.rows.length,
              });
              try {
                let successful = 0;
                let failed = 0;
                const result =
                  await telegramChannelsApi.importPostGroupsWithProgress(
                    parsed.rows.map((row) => ({
                      telegramChannelId: channelId,
                      ...row,
                    })),
                    (item, current, total) => {
                      if (item.success) successful += 1;
                      else failed += 1;
                      operation.update({
                        message: (locale === "en" ? item.message : null) || t("telegram.posts.import.importingGroups"),
                        current,
                        total,
                        progressSummary: { successful, failed },
                      });
                    },
                  );
                await onImported();
                const completion = {
                  message: t("telegram.posts.import.result", { successful: result.successCount, failed: result.failedCount }),
                };
                if (result.failedCount) {
                  operation.fail(completion);
                  setError(completion.message);
                } else {
                  operation.succeed(completion);
                  reset();
                  onClose();
                }
              } catch (importError) {
                const message =
                  locale === "en" && importError instanceof Error
                    ? importError.message
                    : t("telegram.posts.import.groupsError");
                setError(message);
                operation.fail({ message });
              } finally {
                setImporting(false);
              }
            }}
          >
            {importing ? (
              <LoaderCircle size={15} className="animate-spin" />
            ) : (
              <Upload size={15} />
            )}
            {t("telegram.posts.import.groupsButton", { count: parsed.rows.length || 0 })}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

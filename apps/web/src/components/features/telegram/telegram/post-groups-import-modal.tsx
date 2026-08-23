"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, LoaderCircle, Upload } from "lucide-react";
import { Button, Modal } from "@/components/ui/primitives";
import { telegramChannelsApi, workspaceMembersApi } from "@/lib/api";
import { memberKeys } from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";
import { ManagedPostsImportSource } from "./managed-posts-import-source";
import {
  parsePostGroupImportContent,
  postGroupsGptPrompt,
} from "./post-groups-import-model";

export function PostGroupsImportModal({
  open,
  channelId,
  onClose,
  onImported,
}: {
  open: boolean;
  channelId: string;
  onClose: () => void;
  onImported: () => Promise<void>;
}) {
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
            : "Could not parse groups.",
      };
    }
  }, [content]);
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
      ? `Member ${unknownMember.createdByMemberId} is not in this workspace.`
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
      setError("Could not read this file.");
    }
  };
  const prompt = postGroupsGptPrompt(
    (members.data || []).map((member) => ({
      id: member.id,
      name: member.user.name,
    })),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import post groups"
      size="xl"
      headerAction={
        <Button
          type="button"
          variant="secondary"
          className="h-9 px-3 text-sm"
          onClick={async () => {
            await navigator.clipboard.writeText(prompt);
            pushToast("Group import prompt copied.", "success");
          }}
        >
          <ClipboardList size={15} /> GPT prompt
        </Button>
      }
    >
      <div className="space-y-4">
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
                      {member?.user.name || "Current member"}
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
            JSON supports title, description, icon, memberId,
            statusNumberingEnabled and postIds.
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
                title: "Import post groups",
                message: "Starting import…",
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
                        message: item.message || "Importing groups…",
                        current,
                        total,
                        progressSummary: { successful, failed },
                      });
                    },
                  );
                await onImported();
                const completion = {
                  message: `Import finished: ${result.successCount} successful, ${result.failedCount} failed.`,
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
                  importError instanceof Error
                    ? importError.message
                    : "Could not import groups.";
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
            Import {parsed.rows.length || ""} groups
          </Button>
        </div>
      </div>
    </Modal>
  );
}

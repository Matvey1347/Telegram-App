"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  LoaderCircle,
  Pencil,
} from "lucide-react";
import {
  Button,
  Input,
  Modal,
  TooltipBubble,
} from "@/components/ui/primitives";
import { telegramChannelsApi, type TelegramManagedPost } from "@/lib/api";
import { telegramPostKeys } from "@/lib/query-keys";
import { reconcileManagedPost } from "./managed-post-cache";
import { useAppToast } from "@/providers/toast-provider";

type IdentityTone = "normal" | "warning" | "error";
type ManagedPostIdentityPresentation = {
  status: TelegramManagedPost["status"];
  telegramIdVerificationStatus: TelegramManagedPost["telegramIdVerificationStatus"];
  telegramLinkSource: TelegramManagedPost["telegramLinkSource"];
  telegramRemoteStatus: string;
  lastError?: string | null;
};

export function managedPostTelegramIdentityTone(
  post: ManagedPostIdentityPresentation,
): IdentityTone {
  if (
    post.telegramIdVerificationStatus === "MISSING" ||
    post.telegramRemoteStatus === "BROKEN" ||
    post.telegramRemoteStatus === "MISSING" ||
    /link is broken/i.test(post.lastError ?? "")
  ) {
    return "error";
  }
  if (post.status === "SCHEDULED") return "normal";
  if (
    post.status === "PUBLISHED" &&
    (post.telegramIdVerificationStatus === "MISMATCH" ||
      post.telegramIdVerificationStatus === "UNVERIFIED")
  ) {
    return "warning";
  }
  return "normal";
}

export function managedPostPublishedTelegramUrl(
  post: Pick<TelegramManagedPost, "status" | "telegramMessageUrls">,
) {
  if (post.status !== "PUBLISHED") return null;
  return post.telegramMessageUrls[0] ?? null;
}

export function ManagedPostTelegramIdentityIndicator({
  post,
  className = "",
}: {
  post: ManagedPostIdentityPresentation;
  className?: string;
}) {
  const tone = managedPostTelegramIdentityTone(post);
  if (tone === "normal") return null;

  const missing = tone === "error";
  const label = missing
    ? "Telegram post was not found"
    : post.telegramIdVerificationStatus === "MISMATCH"
      ? "Telegram ID mismatch"
      : "Telegram ID has not been verified";

  return (
    <AlertTriangle
      size={13}
      className={`shrink-0 ${missing ? "text-red-400" : "text-amber-400"} ${className}`}
      aria-label={label}
    />
  );
}

function verificationDescription(post: TelegramManagedPost) {
  switch (post.telegramIdVerificationStatus) {
    case "VERIFIED":
      return "This link matches the published post found in Telegram.";
    case "MISMATCH":
      return "This Telegram link was set manually and does not match the post found in Telegram. The manual link was preserved.";
    case "MISSING":
      return "Telegram could not find a published message matching this managed post. The saved link was preserved.";
    default:
      return post.telegramLinkSource === "MANUAL"
        ? "This manual Telegram link has not been verified yet."
        : "Telegram has not verified a published identity for this post yet.";
  }
}

export function ManagedPostTelegramLink({
  channelId,
  post,
  canManage,
  onPostUpdated,
}: {
  channelId: string;
  post: TelegramManagedPost;
  canManage: boolean;
  onPostUpdated?: (post: TelegramManagedPost) => void;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const [open, setOpen] = useState(false);
  const [telegramUrl, setTelegramUrl] = useState(
    post.telegramMessageUrls[0] ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const publishedUrl = managedPostPublishedTelegramUrl(post);
  const tone = managedPostTelegramIdentityTone(post);
  const storedUrl = post.telegramMessageUrls[0] ?? "";
  const hasUnsavedUrl = telegramUrl.trim() !== storedUrl;
  const isLocalSchedule =
    post.status === "SCHEDULED" && post.scheduleMode === "LOCAL";
  const scheduledStatusLabel = isLocalSchedule
    ? "Scheduled via Nexeloq"
    : "Scheduled in Telegram";
  const scheduledStatusDescription = isLocalSchedule
    ? "Telegram System will publish this post at the scheduled time. It is not currently in Telegram Scheduled Messages."
    : "Telegram link will be available after publication and verification.";

  const openModal = () => {
    setTelegramUrl(storedUrl);
    setError("");
    setOpen(true);
  };

  const applyPost = async (updated: TelegramManagedPost) => {
    reconcileManagedPost(queryClient, channelId, updated);
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: telegramPostKeys.managedCalendar(channelId),
      }),
      queryClient.invalidateQueries({
        queryKey: telegramPostKeys.linkTargets(channelId),
      }),
      queryClient.invalidateQueries({
        queryKey: telegramPostKeys.managedHistory(channelId, updated.id),
      }),
      queryClient.invalidateQueries({
        queryKey: telegramPostKeys.postGroups(channelId),
      }),
    ]);
    setTelegramUrl(updated.telegramMessageUrls[0] ?? "");
    onPostUpdated?.(updated);
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const updated = await telegramChannelsApi.setManagedPostTelegramUrl(
        channelId,
        post.id,
        telegramUrl.trim(),
      );
      await applyPost(updated);
      if (!updated.telegramMessageUrls.length) setOpen(false);
      pushToast(
        updated.telegramMessageUrls.length
          ? "Telegram post link saved. Verify it against Telegram to confirm the ID."
          : "Telegram post link removed. Post returned to draft.",
        "success",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save Telegram post link",
      );
    } finally {
      setSaving(false);
    }
  };

  const verify = async () => {
    setVerifying(true);
    setError("");
    try {
      const updated = await telegramChannelsApi.verifyManagedPostTelegramId(
        channelId,
        post.id,
      );
      await applyPost(updated);
      pushToast(
        updated.telegramIdVerificationStatus === "VERIFIED"
          ? "Telegram post ID verified."
          : verificationDescription(updated),
        updated.telegramIdVerificationStatus === "MISSING" ? "error" : "info",
        7000,
      );
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : "Could not verify the Telegram post ID",
      );
    } finally {
      setVerifying(false);
    }
  };

  if (!canManage) return null;

  const buttonClasses =
    tone === "error"
      ? "border-red-700 bg-red-950/20 text-red-200 hover:border-red-600 hover:bg-red-950/35"
      : tone === "warning"
        ? "border-amber-700 bg-amber-950/20 text-amber-200 hover:border-amber-600 hover:bg-amber-950/35"
        : "border-neutral-700 text-blue-300 hover:border-blue-600 hover:bg-blue-950/30 hover:text-blue-200";

  return (
    <>
      <span className="relative inline-flex items-center gap-1 group">
        {post.status === "SCHEDULED" ? (
          <button
            type="button"
            onClick={openModal}
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition ${
              tone === "error"
                ? "border-red-700 bg-red-950/20 text-red-200 hover:border-red-600 hover:bg-red-950/35"
                : "border-neutral-700 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-900"
            }`}
          >
            {tone === "error" ? (
              <AlertTriangle size={13} />
            ) : (
              <Clock3 size={13} />
            )}
            {scheduledStatusLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              publishedUrl
                ? window.open(publishedUrl, "_blank", "noopener,noreferrer")
                : openModal()
            }
            className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition ${buttonClasses}`}
          >
            {tone === "error" || tone === "warning" ? (
              <AlertTriangle size={13} />
            ) : post.telegramIdVerificationStatus === "VERIFIED" ? (
              <CheckCircle2 size={13} />
            ) : (
              <ExternalLink size={13} />
            )}
            Open in TG
          </button>
        )}
        <button
          type="button"
          onClick={openModal}
          aria-label={
            post.status === "SCHEDULED"
              ? "View scheduled Telegram status"
              : "Set or verify Telegram link"
          }
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-700 text-neutral-400 transition hover:border-blue-600 hover:bg-blue-950/30 hover:text-blue-200"
        >
          <Pencil size={13} />
        </button>
        <TooltipBubble
          side="top"
          align="center"
          className="max-w-72 px-2.5 py-1.5 text-neutral-200 opacity-0 transition-opacity group-hover:opacity-100"
        >
          {post.status === "SCHEDULED"
            ? scheduledStatusDescription
            : verificationDescription(post)}
        </TooltipBubble>
      </span>

      <Modal
        open={open}
        onClose={() => !saving && !verifying && setOpen(false)}
        title={
          post.status === "SCHEDULED"
            ? isLocalSchedule
              ? "Scheduled delivery status"
              : "Scheduled Telegram status"
            : storedUrl
              ? "Telegram post link"
              : "Set Telegram link"
        }
      >
        {post.status === "SCHEDULED" ? (
          <div className="space-y-3">
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                tone === "error"
                  ? "border-red-800/70 bg-red-950/20 text-red-100"
                  : "border-neutral-700 bg-neutral-900 text-neutral-300"
              }`}
            >
              <p className="font-medium text-white">{scheduledStatusLabel}</p>
              <p className="mt-0.5 text-xs">
                {tone === "error"
                  ? "Telegram could not confirm this scheduled post. A scheduled ID is not a public post link; refresh or reconcile the channel before publication."
                  : scheduledStatusDescription}
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-neutral-300">
              Paste a published Telegram post URL. Manual links are preserved
              when verification finds a mismatch or cannot find the post.
            </p>
            <Input
              type="url"
              value={telegramUrl}
              onChange={(event) => setTelegramUrl(event.target.value)}
              placeholder="https://t.me/c/123456/789"
              autoFocus
            />
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${
                tone === "error"
                  ? "border-red-800/70 bg-red-950/20 text-red-100"
                  : tone === "warning"
                    ? "border-amber-800/70 bg-amber-950/20 text-amber-100"
                    : "border-neutral-800 bg-neutral-950/40 text-neutral-300"
              }`}
            >
              {verificationDescription(post)}
            </div>
            {hasUnsavedUrl ? (
              <p className="text-xs text-amber-300">
                Save this link before checking its Telegram ID.
              </p>
            ) : null}
            {error ? (
              <div className="rounded-lg border border-red-800/70 bg-red-950/20 px-3 py-2 text-sm text-red-100">
                {error}
              </div>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                type="button"
                disabled={saving || verifying}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="secondary"
                type="button"
                disabled={saving || verifying || hasUnsavedUrl || !storedUrl}
                onClick={() => void verify()}
              >
                {verifying ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : null}
                {verifying ? "Checking…" : "Check Telegram ID"}
              </Button>
              <Button
                type="button"
                disabled={saving || verifying}
                onClick={() => void save()}
              >
                {saving
                  ? "Saving…"
                  : telegramUrl.trim()
                    ? "Save link"
                    : "Remove link"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

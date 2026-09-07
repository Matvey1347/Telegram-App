import type { CrmRealtimeEvent } from "@telegram-system/shared";
import type { AppProgress } from "@/providers/toast-provider";

type SyncProgressEvent = Extract<CrmRealtimeEvent, { type: "sync.progress" }>;

export function crmSyncProgress(event: SyncProgressEvent): AppProgress {
  const completed = event.phase === "COMPLETED" || event.phase === "FAILED";
  return {
    id: `telegram-crm-sync:${event.accountId}`,
    title: "Telegram CRM sync",
    current: event.total > 0 ? event.current : undefined,
    total: event.total > 0 ? event.total : undefined,
    completed,
    successCount: event.phase === "COMPLETED" ? 1 : 0,
    failedCount: event.phase === "FAILED" ? 1 : 0,
    message:
      event.phase === "FAILED"
        ? "CRM synchronization failed. You can safely retry it."
        : completed
          ? `Completed: ${event.importedConversations} conversations, ${event.importedMessages} messages.`
          : `Scanned ${event.scannedDialogs} dialogs · imported ${event.importedConversations} conversations and ${event.importedMessages} messages.`,
    iconEmoji: "🔄",
  };
}

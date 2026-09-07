import { describe, expect, it } from "vitest";
import { crmSyncProgress } from "./crm-sync-progress";

describe("crmSyncProgress", () => {
  it("maps streamed page counters to determinate application progress", () => {
    expect(
      crmSyncProgress({
        type: "sync.progress",
        workspaceId: "workspace-1",
        accountId: "account-1",
        ownerMemberId: "member-1",
        occurredAt: "2026-09-06T12:00:00.000Z",
        phase: "RUNNING",
        current: 300,
        total: 2_000,
        scannedDialogs: 300,
        importedPeers: 250,
        importedConversations: 240,
        importedMessages: 100,
      }),
    ).toMatchObject({
      id: "telegram-crm-sync:account-1",
      current: 300,
      total: 2_000,
      completed: false,
      message: expect.stringContaining("240 conversations"),
    });
  });

  it("does not show an invented denominator before Telegram reports its total", () => {
    expect(
      crmSyncProgress({
        type: "sync.progress",
        workspaceId: "workspace-1",
        accountId: "account-1",
        ownerMemberId: "member-1",
        occurredAt: "2026-09-06T12:00:00.000Z",
        phase: "STARTED",
        current: 0,
        total: 0,
        scannedDialogs: 0,
        importedPeers: 0,
        importedConversations: 0,
        importedMessages: 0,
      }),
    ).toMatchObject({ current: undefined, total: undefined });
  });
});

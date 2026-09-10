import { beforeEach, describe, expect, it, vi } from "vitest";

const streamProgressAction = vi.fn();
const patch = vi.fn();
const post = vi.fn();

vi.mock("@/lib/api", () => ({
  api: { patch, post },
  streamProgressAction,
}));

describe("mutualPromotionFoldersApi activation", () => {
  beforeEach(() => {
    vi.resetModules();
    streamProgressAction.mockReset();
    patch.mockReset();
    post.mockReset();
  });

  it("uses the activation stream and forwards real delivery progress", async () => {
    const result = { deliveriesCreated: 10, successCount: 10, failedCount: 0 };
    streamProgressAction.mockResolvedValue(result);
    const { mutualPromotionFoldersApi } =
      await import("./mutual-promotion-folders-api");
    const onProgress = vi.fn();

    await expect(
      mutualPromotionFoldersApi.activate("folder-1", onProgress),
    ).resolves.toBe(result);
    expect(streamProgressAction).toHaveBeenCalledWith(
      "/mutual-promotion-folders/folder-1/activate",
      {},
      onProgress,
    );
  });

  it("replaces invite links through the dedicated endpoint", async () => {
    const payload = {
      participants: [
        {
          participantId: "participant-1",
          inviteLinkId: "invite-2",
          inviteLinkMode: "FOLDER_ONLY" as const,
        },
      ],
    };
    const updated = { id: "folder-1" };
    patch.mockResolvedValue({ data: updated });
    const { mutualPromotionFoldersApi } =
      await import("./mutual-promotion-folders-api");

    await expect(
      mutualPromotionFoldersApi.updateInviteLinks("folder-1", payload),
    ).resolves.toBe(updated);
    expect(patch).toHaveBeenCalledWith(
      "/mutual-promotion-folders/folder-1/invite-links",
      payload,
    );
  });

  it("imports and verifies a manually entered invite link", async () => {
    const payload = {
      telegramChannelId: "channel-1",
      url: "https://t.me/+legacy",
      folderId: "folder-1",
      endsAt: "2026-09-10T08:00:00.000Z",
    };
    const option = { id: "link-1", ...payload, available: true };
    post.mockResolvedValue({ data: option });
    const { mutualPromotionFoldersApi } =
      await import("./mutual-promotion-folders-api");

    await expect(
      mutualPromotionFoldersApi.importInviteLink(payload),
    ).resolves.toBe(option);
    expect(post).toHaveBeenCalledWith(
      "/mutual-promotion-folders/invite-link-options/import",
      payload,
    );
  });
});

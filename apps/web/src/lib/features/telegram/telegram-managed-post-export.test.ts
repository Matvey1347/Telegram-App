import { describe, expect, it } from "vitest";
import type { TelegramManagedPost } from "@/lib/api";
import { buildManagedPostsTextExport } from "./telegram-managed-post-export";

describe("buildManagedPostsTextExport", () => {
  it("includes engagement rates and the reaction breakdown", () => {
    const post = {
      id: "managed-1",
      title: "Popular post",
      text: "Useful content",
      primaryTelegramMessageUrl: "https://t.me/channel/42",
      engagementMetrics: [
        {
          telegramPostId: "telegram-post-1",
          telegramMessageId: "42",
          viewsCount: 1200,
          forwardsCount: 30,
          reactionsCount: 75,
          commentsCount: 12,
          adjustedViewsCount: 1190,
          adjustedReactionsCount: 73,
          subscriberCount: 2000,
          err: 59.5,
          reactionRate: 6.134,
          forwardRate: 2.5,
          commentRate: 1.01,
          reactions: [
            { reaction: "👍", count: 50 },
            { reaction: "🔥", count: 25 },
          ],
        },
        {
          telegramPostId: "telegram-post-2",
          telegramMessageId: "43",
          viewsCount: 1180,
          forwardsCount: 4,
          reactionsCount: 10,
          commentsCount: 1,
          adjustedViewsCount: 1170,
          adjustedReactionsCount: 9,
          subscriberCount: 2000,
          err: 58.5,
          reactionRate: 0.77,
          forwardRate: 0.34,
          commentRate: 0.09,
          reactions: null,
        },
      ],
    } as TelegramManagedPost;

    const result = buildManagedPostsTextExport([post]);

    expect(result).toContain("Просмотры: 1200 (скорректированные: 1190)");
    expect(result).toContain("ERR: 59.50%");
    expect(result).toContain("Reaction rate: 6.13%");
    expect(result).toContain("Реакции по типам: 👍 50, 🔥 25");
    expect(result).toContain("Сообщение 1 (Telegram ID: 42)");
    expect(result).toContain("Сообщение 2 (Telegram ID: 43)");
    expect(result).toContain("Telegram: https://t.me/channel/42");
  });

  it("keeps posts without engagement exportable", () => {
    const post = {
      id: "managed-2",
      title: "Draft",
      text: null,
    } as TelegramManagedPost;

    expect(buildManagedPostsTextExport([post])).toContain("[Пост без текста]");
  });

  it("marks synchronized posts as analytics-only references", () => {
    const post = {
      id: "telegram-post:source-1",
      telegramPostId: "source-1",
      title: "Synced post",
      text: "Published in Telegram",
      readOnlyTelegramPost: true,
    } as TelegramManagedPost;

    const result = buildManagedPostsTextExport([post]);

    expect(result).toContain("telegram-source-post:source-1 — Synced post");
    expect(result).not.toContain("tg-post:telegram-post:source-1");
  });
});

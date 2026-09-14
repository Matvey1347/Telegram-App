import { describe, expect, it } from "vitest";
import type { TelegramPostBatchDelivery } from "@telegram-system/shared";
import type { TranslationFunction } from "@/providers/i18n-provider";
import { deletionLabel } from "./post-batch-deliveries";

describe("post batch delivery countdown", () => {
  it("does not duplicate the Russian future-time prefix", () => {
    const now = new Date("2026-09-14T10:00:00.000Z").getTime();
    const delivery = {
      deleteAt: "2026-09-14T12:00:00.000Z",
      deletedAt: null,
      status: "PUBLISHED",
    } as TelegramPostBatchDelivery;
    const t = ((key: string, values?: Record<string, unknown>) =>
      key === "telegram.posts.batch.deletesIn"
        ? `Удаление ${String(values?.time)}`
        : key) as TranslationFunction;

    const label = deletionLabel(delivery, now, "ru", t);

    expect(label).toBe("Удаление через 2 часа");
    expect(label).not.toContain("через через");
  });
});

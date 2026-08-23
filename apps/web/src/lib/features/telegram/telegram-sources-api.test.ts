import { describe, expect, it, vi } from "vitest";
import type { AxiosInstance } from "axios";
import { createTelegramSourcesApi } from "./telegram-sources-api";

describe("telegramUserAccountsApi.loginWithQr", () => {
  it("uses one streaming POST and forwards its AbortSignal", async () => {
    const streamProgressAction = vi.fn().mockResolvedValue({
      success: true,
      status: "needs_password",
    });
    const api = createTelegramSourcesApi({
      api: {} as AxiosInstance,
      crud: vi.fn(() => ({
        list: vi.fn(),
        get: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
      })),
      getPaginated: vi.fn(),
      getAllPaginatedItems: vi.fn(),
      streamProgressAction,
    });
    const controller = new AbortController();
    const onProgress = vi.fn();

    await api.telegramUserAccountsApi.loginWithQr(
      "account-1",
      onProgress,
      controller.signal,
    );

    expect(streamProgressAction).toHaveBeenCalledOnce();
    expect(streamProgressAction).toHaveBeenCalledWith(
      "/telegram-user-accounts/account-1/login/qr-stream",
      {},
      onProgress,
      { signal: controller.signal },
    );
  });
});

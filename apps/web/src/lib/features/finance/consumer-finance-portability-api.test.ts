import type { InternalAxiosRequestConfig } from "axios";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  consumerFinancePortabilityApi,
  importConsumerFinanceData,
} from "./consumer-finance-portability-api";
import { consumerFinanceHttp } from "./consumer-finance-http";

const originalAdapter = consumerFinanceHttp.defaults.adapter;

function ndjsonResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "application/x-ndjson" } },
  );
}

afterEach(() => {
  consumerFinanceHttp.defaults.adapter = originalAdapter;
  vi.unstubAllGlobals();
});

describe("consumerFinancePortabilityApi", () => {
  it("loads the portability history from the consumer-scoped endpoint", async () => {
    let request: InternalAxiosRequestConfig | undefined;
    consumerFinanceHttp.defaults.adapter = async (config) => {
      request = config;
      return {
        data: { items: [] },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    };

    await expect(
      consumerFinancePortabilityApi.portabilityHistory("bot id"),
    ).resolves.toEqual({ items: [] });
    expect(request?.method).toBe("get");
    expect(request?.url).toBe("/finance-bots/bot id/portability-history");
  });

  it("sends the fixed server confirmation when rolling an import back", async () => {
    let request: InternalAxiosRequestConfig | undefined;
    consumerFinanceHttp.defaults.adapter = async (config) => {
      request = config;
      return {
        data: { importId: "rollback-1", restoredFromImportId: "import/1" },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      };
    };

    await consumerFinancePortabilityApi.rollbackImport("bot", "import/1");

    expect(request?.method).toBe("post");
    expect(request?.url).toBe("/finance-bots/bot/imports/import%2F1/rollback");
    expect(JSON.parse(String(request?.data))).toEqual({
      confirmation: "ROLLBACK FINANCE IMPORT",
    });
  });
});

describe("importConsumerFinanceData", () => {
  it("consumes split NDJSON progress and returns the final result", async () => {
    const progress = {
      phase: "IMPORTING" as const,
      section: "transactions" as const,
      processed: 2,
      total: 2,
    };
    const result = {
      importId: "import-1",
      duplicate: false,
      imported: 2,
      counts: { transactions: 2 },
      warnings: [],
    };
    const body = `${JSON.stringify({ type: "progress", item: progress, current: 4, total: 15 })}\n${JSON.stringify({ type: "complete", result })}\n`;
    const fetchMock = vi
      .fn()
      .mockResolvedValue(ndjsonResponse([body.slice(0, 27), body.slice(27)]));
    vi.stubGlobal("fetch", fetchMock);
    const onProgress = vi.fn();

    await expect(
      importConsumerFinanceData({
        botId: "bot/with spaces",
        file: new File(["{}"], "finance.json", { type: "application/json" }),
        mode: "REPLACE",
        onProgress,
      }),
    ).resolves.toEqual(result);
    expect(onProgress).toHaveBeenCalledWith(progress, 4, 15);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/finance-bots/bot%2Fwith%20spaces/import-stream",
      ),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: expect.any(FormData),
        headers: expect.objectContaining({
          Accept: "application/x-ndjson",
          "X-Finance-Consumer-Request": "1",
        }),
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((request.body as FormData).get("mode")).toBe("REPLACE");
  });

  it("surfaces a structured streamed validation error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        ndjsonResponse([
          `${JSON.stringify({
            type: "error",
            code: "FINANCE_IMPORT_INVALID",
            path: "data.accounts[0].currency",
            message: "Expected a three-letter uppercase currency code",
          })}\n`,
        ]),
      ),
    );

    await expect(
      importConsumerFinanceData({
        botId: "bot",
        file: new File(["{}"], "finance.json"),
        mode: "ADD",
        onProgress: vi.fn(),
      }),
    ).rejects.toMatchObject({
      code: "FINANCE_IMPORT_INVALID",
      path: "data.accounts[0].currency",
    });
  });

  it("fails when the connection ends without a completion event", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ndjsonResponse([])));

    await expect(
      importConsumerFinanceData({
        botId: "bot",
        file: new File(["{}"], "finance.json"),
        mode: "ADD",
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow("Import stream ended before completion");
  });
});

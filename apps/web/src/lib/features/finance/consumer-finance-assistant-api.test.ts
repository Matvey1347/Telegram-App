import { afterEach, describe, expect, it, vi } from "vitest";
import { consumerFinanceAssistantApi } from "./consumer-finance-assistant-api";
import { consumerFinanceHttp } from "./consumer-finance-http";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("consumerFinanceAssistantApi.proposeFiles", () => {
  it("uploads every selected receipt image in one multipart request", async () => {
    const post = vi.spyOn(consumerFinanceHttp, "post").mockResolvedValue({
      data: { token: "proposal", operations: [] },
    });
    const files = [
      new File(["one"], "one.png", { type: "image/png" }),
      new File(["two"], "two.webp", { type: "image/webp" }),
    ];

    await consumerFinanceAssistantApi.proposeFiles("bot", files);

    const form = post.mock.calls[0]?.[1] as FormData;
    expect(form.getAll("files")).toEqual(files);
    expect(post).toHaveBeenCalledWith(
      "/finance-bots/bot/ultimate/entry/media",
      expect.any(FormData),
      expect.any(Object),
    );
  });
});

describe("consumerFinanceAssistantApi.message", () => {
  it("decodes split NDJSON chunks and exposes deltas before completion", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode('{"type":"start"}\n{"type":"delta","delta":"Hel'),
        );
        controller.enqueue(
          encoder.encode(
            'lo "}\n{"type":"delta","delta":"there"}\n' +
              '{"type":"done","result":{"kind":"ANSWER","message":"Hello there"}}\n',
          ),
        );
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "application/x-ndjson" },
      }),
    );
    global.fetch = fetchMock;
    const deltas: string[] = [];

    await expect(
      consumerFinanceAssistantApi.message(
        "bot-id",
        { text: "hello", history: [] },
        { onDelta: (delta) => deltas.push(delta) },
      ),
    ).resolves.toEqual({ kind: "ANSWER", message: "Hello there" });

    expect(deltas).toEqual(["Hello ", "there"]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/finance-bots/bot-id/ultimate/message",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: expect.objectContaining({
          "X-Finance-Consumer-Request": "1",
        }),
      }),
    );
  });

  it("rejects a stream-level error without waiting for a done event", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          '{"type":"start"}\n{"type":"error","message":"Provider failed"}\n',
          { status: 200 },
        ),
      ) as never;

    await expect(
      consumerFinanceAssistantApi.message("bot", { text: "hello" }),
    ).rejects.toThrow("Provider failed");
  });
});

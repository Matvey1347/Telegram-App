// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");
const origin = "https://app.example";
const inbox = "/ad-sales/inbox?conversationId=conversation-a&workspaceId=workspace-a";

type MockWindow = {
  url: string;
  focus: ReturnType<typeof vi.fn>;
  navigate?: ReturnType<typeof vi.fn>;
  postMessage: ReturnType<typeof vi.fn>;
};
type MockWorkerEvent = {
  data?: { json: () => unknown };
  notification?: { close: ReturnType<typeof vi.fn>; data: { targetUrl: unknown } };
  waitUntil: (work: Promise<unknown>) => void;
};
function setup(windows: MockWindow[] = []) {
  const handlers = new Map<string, (event: MockWorkerEvent) => void>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(null);
  const matchAll = vi.fn().mockResolvedValue(windows);
  const fetch = vi.fn().mockRejectedValue(new Error("Unexpected service-worker request"));
  const cacheOpen = vi.fn();
  const cacheMatch = vi.fn();
  runInNewContext(source, { URL, fetch, caches: { open: cacheOpen, match: cacheMatch }, self: {
    location: { origin }, registration: { showNotification }, clients: { matchAll, openWindow },
    addEventListener: (type: string, handler: (event: MockWorkerEvent) => void) => handlers.set(type, handler),
  } });
  const dispatch = async (type: string, event: Omit<MockWorkerEvent, "waitUntil">) => {
    const pending: Promise<unknown>[] = [];
    handlers.get(type)?.({ ...event, waitUntil: (work) => pending.push(work) });
    await Promise.all(pending);
  };
  const push = (payload: unknown) => dispatch("push", { data: { json: () => payload } });
  const click = async (targetUrl: unknown = inbox) => {
    const close = vi.fn();
    await dispatch("notificationclick", { notification: { close, data: { targetUrl } } });
    expect(close).toHaveBeenCalledOnce();
  };
  return { showNotification, openWindow, matchAll, push, click, dispatch, fetch, cacheOpen, cacheMatch };
}
function windowClient(url = `${origin}/dashboard`): MockWindow {
  const client: MockWindow = { url, focus: vi.fn(), postMessage: vi.fn() };
  client.focus.mockResolvedValue(client);
  client.navigate = vi.fn().mockResolvedValue(client);
  return client;
}

describe("notification service worker push delivery", () => {
  it.each([
    { scenario: "the exact conversation is foreground", url: `${origin}${inbox}`, visibilityState: "visible", focused: true },
    { scenario: "another conversation is foreground", url: `${origin}/ad-sales/inbox?conversationId=another-chat`, visibilityState: "visible", focused: true },
    { scenario: "an existing window is background/hidden", url: `${origin}${inbox}`, visibilityState: "hidden", focused: false },
  ])("still shows push when $scenario without treating visibility as read proof", async ({ url, visibilityState, focused }) => {
    const client = { ...windowClient(url), visibilityState, focused };
    const worker = setup([client]);
    await worker.push({ id: "visible-state-group", title: "New workspace activity", body: "Open Nexeloq to review the update.", targetUrl: inbox });
    expect(worker.showNotification).toHaveBeenCalledOnce();
    expect(worker.showNotification).toHaveBeenCalledWith("New workspace activity", expect.objectContaining({ tag: "visible-state-group", data: { targetUrl: inbox } }));
    expect(worker.matchAll).not.toHaveBeenCalled();
    expect(client.focus).not.toHaveBeenCalled();
    expect(client.navigate).not.toHaveBeenCalled();
    expect(client.postMessage).not.toHaveBeenCalled();
    expect(worker.openWindow).not.toHaveBeenCalled();
    // Push arrival alone must never fetch/mark read or write a private cache.
    expect(worker.fetch).not.toHaveBeenCalled();
    expect(worker.cacheOpen).not.toHaveBeenCalled();
    expect(worker.cacheMatch).not.toHaveBeenCalled();
  });

  it("shows bounded backend-approved preview with a stable non-renotifying group tag", async () => {
    const worker = setup();
    for (let index = 1; index <= 5; index += 1) await worker.push({ id: "group-a", title: "Customer", body: `Message ${index}`, targetUrl: inbox });
    expect(worker.showNotification).toHaveBeenCalledTimes(5);
    for (const [title, options] of worker.showNotification.mock.calls) {
      expect(title).toBe("Customer");
      expect(options).toMatchObject({ tag: "group-a", renotify: false, data: { targetUrl: inbox } });
    }
  });

  it.each([null, [], "invalid", { title: 12, body: {}, targetUrl: "https://evil.example/chat" }])("uses private safe fallbacks for malformed payload %j", async (payload) => {
    const worker = setup();
    await worker.push(payload);
    expect(worker.showNotification).toHaveBeenCalledWith("New workspace activity", expect.objectContaining({ body: "Open Nexeloq to review the update.", renotify: false, data: { targetUrl: "/" } }));
  });

  it("handles an invalid JSON push without failing the notification event", async () => {
    const worker = setup();
    await worker.dispatch("push", { data: { json: () => { throw new Error("Invalid JSON"); } } });
    expect(worker.showNotification).toHaveBeenCalledOnce();
  });

  it("bounds text and does not install offline cache or fetch handlers", async () => {
    const worker = setup();
    await worker.push({ title: "t".repeat(300), body: "b".repeat(600), id: "i".repeat(500), targetUrl: inbox });
    const [title, options] = worker.showNotification.mock.calls[0];
    expect(title).toHaveLength(120);
    expect(options.body).toHaveLength(240);
    expect(options.tag).toHaveLength(200);
    expect(source).not.toMatch(/addEventListener\(["']fetch|caches\.|fetch\(/);
  });

  it("accepts a generic future Support projector payload without CRM assumptions", async () => {
    const worker = setup();
    await worker.push({ notification: { id: "mock-support-group", title: "Support update", body: "Open the app to review.", targetUrl: "/support/inbox?ticket=mock" } });
    expect(worker.showNotification).toHaveBeenCalledWith("Support update", expect.objectContaining({ tag: "mock-support-group", data: { targetUrl: "/support/inbox?ticket=mock" } }));
  });
});

describe("notification service worker click navigation", () => {
  it("opens the exact Inbox route when the PWA is closed", async () => {
    const worker = setup();
    await worker.click();
    expect(worker.openWindow).toHaveBeenCalledWith(`${origin}${inbox}`);
  });

  it("navigates and focuses an existing same-origin window", async () => {
    const client = windowClient();
    const worker = setup([client]);
    await worker.click();
    expect(client.navigate).toHaveBeenCalledWith(`${origin}${inbox}`);
    expect(client.focus).toHaveBeenCalledOnce();
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("prefers an existing exact destination and does not navigate it again", async () => {
    const other = windowClient();
    const exact = windowClient(`${origin}${inbox}`);
    const worker = setup([other, exact]);
    await worker.click();
    expect(exact.focus).toHaveBeenCalledOnce();
    expect(exact.navigate).not.toHaveBeenCalled();
    expect(other.focus).not.toHaveBeenCalled();
  });

  it.each(["null", "rejected"])("opens a fresh destination when existing-window navigation is %s", async (failure) => {
    const client = windowClient();
    if (failure === "null") client.navigate?.mockResolvedValue(null);
    else client.navigate?.mockRejectedValue(new Error("Window is closing"));
    const worker = setup([client]);
    await worker.click();
    expect(worker.openWindow).toHaveBeenCalledWith(`${origin}${inbox}`);
  });

  it("uses the existing provider message fallback when navigate is unavailable", async () => {
    const client = windowClient();
    delete client.navigate;
    const worker = setup([client]);
    await worker.click();
    expect(client.postMessage).toHaveBeenCalledWith({ type: "notification.navigate", targetUrl: inbox });
    expect(client.focus).toHaveBeenCalledOnce();
  });

  it.each(["https://evil.example/", "javascript:alert(1)", "//evil.example/inbox", null])("rejects unsafe destination %j", async (target) => {
    const worker = setup([windowClient("https://evil.example/elsewhere")]);
    await worker.click(target);
    expect(worker.openWindow).toHaveBeenCalledWith(`${origin}/`);
  });

  it("falls back to opening the safe target if enumerating windows fails", async () => {
    const worker = setup();
    worker.matchAll.mockRejectedValue(new Error("Window list unavailable"));
    await worker.click();
    expect(worker.openWindow).toHaveBeenCalledWith(`${origin}${inbox}`);
  });
});

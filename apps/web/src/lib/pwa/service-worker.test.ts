import { describe, expect, it, vi } from "vitest";
import {
  registerAppServiceWorker,
  supportsServiceWorkers,
} from "./service-worker";

describe("app service worker registration", () => {
  it("does nothing when service workers are unavailable", async () => {
    expect(supportsServiceWorkers()).toBe(false);
    await expect(registerAppServiceWorker()).resolves.toBeNull();
  });

  it("registers the shared worker once requested by an app surface", async () => {
    const registration = {} as ServiceWorkerRegistration;
    const register = vi.fn().mockResolvedValue(registration);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register },
    });

    expect(supportsServiceWorkers()).toBe(true);
    await expect(registerAppServiceWorker()).resolves.toBe(registration);
    expect(register).toHaveBeenCalledWith("/sw.js");

    Reflect.deleteProperty(navigator, "serviceWorker");
  });
});

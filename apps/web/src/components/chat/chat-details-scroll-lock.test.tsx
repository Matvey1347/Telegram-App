import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal } from "@/components/ui/modal";
import { ChatDetailsPanel } from "./chat-details-panel";
import { acquireBodyScrollLock } from "@/lib/body-scroll-lock";

const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
afterEach(() => {
  for (const [name, original] of [["showModal", originalShowModal], ["close", originalClose]] as const) {
    if (original) Object.defineProperty(HTMLDialogElement.prototype, name, original);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  } vi.unstubAllGlobals(); vi.restoreAllMocks(); document.body.style.overflow = ""; });
describe("nested chat overlay scroll locks", () => {
  it("restores the original body style when mobile details unmount with an open child modal", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } });
    document.body.style.overflow = "auto";
    const view = render(<ChatDetailsPanel title="Customer" onClose={() => undefined}><Modal open title="Follow-up" onClose={() => undefined}><button>First action</button><button>Last action</button></Modal></ChatDetailsPanel>);
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.querySelector("dialog[open]")).toContainElement(document.querySelector('[data-app-modal="true"]'));
    const last = screen.getByRole("button", { name: "Last action" });
    last.focus(); fireEvent.keyDown(last, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();
    view.unmount(); expect(document.body.style.overflow).toBe("auto");
  });
  it("releases each lock once and retains the remaining owner's lock regardless of release order", () => {
    document.body.style.overflow = "clip";
    const outer = acquireBodyScrollLock(); const inner = acquireBodyScrollLock();
    outer(); outer(); expect(document.body.style.overflow).toBe("hidden");
    inner(); expect(document.body.style.overflow).toBe("clip");
  });
});

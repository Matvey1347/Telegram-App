import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CrmWorkspaceExportButton } from "./crm-workspace-export-button";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";

const feedback = vi.hoisted(() => ({
  succeed: vi.fn(),
  fail: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ startOperation: () => feedback }),
}));

function mockClipboard(writeText: (text: string) => Promise<void>) {
  const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  return () => {
    if (original) Object.defineProperty(navigator, "clipboard", original);
    else Reflect.deleteProperty(navigator, "clipboard");
  };
}

describe("CrmWorkspaceExportButton", () => {
  it("copies a complete workspace export in one click", async () => {
    const documentText = '# Экспорт CRM\n{"type":"end","clients":440,"conversations":0,"deals":0,"messages":0}\n';
    const exportWorkspace = vi.spyOn(telegramCrmApi, "exportWorkspace").mockResolvedValue(documentText);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("ClipboardItem", undefined);
    const restoreClipboard = mockClipboard(writeText);
    try {
      render(<CrmWorkspaceExportButton />);
      const button = screen.getByRole("button", { name: "Copy CRM for AI" });
      expect(button).toHaveClass("bg-blue-600");
      fireEvent.click(button);

      await waitFor(() => expect(feedback.succeed).toHaveBeenCalledWith({
        message: "Copied CRM data for 440 clients. Paste the text into your AI chat.",
      }));
      expect(writeText).toHaveBeenCalledWith(documentText);
      expect(exportWorkspace).toHaveBeenCalledExactlyOnceWith(expect.any(AbortSignal));
    } finally {
      restoreClipboard();
      exportWorkspace.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("reports an interrupted export without copying a partial response", async () => {
    const exportWorkspace = vi.spyOn(telegramCrmApi, "exportWorkspace").mockResolvedValue("# Interrupted export\n");
    const writeText = vi.fn();
    const restoreClipboard = mockClipboard(writeText);
    try {
      render(<CrmWorkspaceExportButton />);
      fireEvent.click(screen.getByRole("button", { name: "Copy CRM for AI" }));

      await waitFor(() => expect(feedback.fail).toHaveBeenCalled());
      expect(writeText).not.toHaveBeenCalled();
    } finally {
      restoreClipboard();
      exportWorkspace.mockRestore();
    }
  });

  it("downloads the complete document when the browser denies clipboard access", async () => {
    const exportWorkspace = vi.spyOn(telegramCrmApi, "exportWorkspace").mockResolvedValue(
      '# Экспорт клиента\n{"type":"end","clients":2,"conversations":1,"deals":0,"messages":1}\n',
    );
    const restoreClipboard = mockClipboard(vi.fn().mockRejectedValue(new Error("Permission denied")));
    const createObjectURL = vi.fn().mockReturnValue("blob:crm-export");
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
    const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("crm-workspace-export.txt");
    });
    try {
      render(<CrmWorkspaceExportButton />);
      fireEvent.click(screen.getByRole("button", { name: "Copy CRM for AI" }));

      await waitFor(() => expect(download).toHaveBeenCalledOnce());
      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    } finally {
      download.mockRestore();
      restoreClipboard();
      exportWorkspace.mockRestore();
      vi.unstubAllGlobals();
    }
  });

});

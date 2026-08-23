import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramUserAccount } from "@/lib/api";
import { TelegramAccountQrModal } from "./telegram-account-qr-modal";

const { loginWithQr, qrCodeSpy } = vi.hoisted(() => ({
  loginWithQr: vi.fn(),
  qrCodeSpy: vi.fn(() => <svg aria-label="Rendered QR" />),
}));

vi.mock("@/lib/api", () => ({
  telegramUserAccountsApi: { loginWithQr },
}));

vi.mock("qrcode.react", () => ({
  QRCodeSVG: qrCodeSpy,
}));

const account = {
  id: "account-1",
  label: "Owner account",
  apiId: "12345",
  isPremium: false,
  captionLengthMax: 1024,
  messageLengthMax: 4096,
  status: "error",
  isActive: true,
} satisfies TelegramUserAccount;

const connectedAccount = {
  ...account,
  status: "connected" as const,
};

function pendingRequest() {
  return new Promise<never>(() => undefined);
}

describe("TelegramAccountQrModal", () => {
  beforeEach(() => {
    loginWithQr.mockReset();
    qrCodeSpy.mockClear();
  });

  it("replaces an expired QR from progress on the same request", async () => {
    let onProgress: ((item: { type: "qr"; loginUrl: string; expiresAt: number }) => void) | undefined;
    loginWithQr.mockImplementation(
      (_id: string, progress: typeof onProgress) => {
        onProgress = progress;
        return pendingRequest();
      },
    );

    render(
      <TelegramAccountQrModal
        open
        account={account}
        onClose={vi.fn()}
        onConnected={vi.fn()}
        onNeedPassword={vi.fn()}
      />,
    );
    await waitFor(() => expect(loginWithQr).toHaveBeenCalledTimes(1));

    act(() =>
      onProgress?.({
        type: "qr",
        loginUrl: "tg://login?token=first",
        expiresAt: Date.now() + 30_000,
      }),
    );
    expect(qrCodeSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: "tg://login?token=first" }),
      undefined,
    );

    act(() =>
      onProgress?.({
        type: "qr",
        loginUrl: "tg://login?token=replacement",
        expiresAt: Date.now() + 60_000,
      }),
    );
    expect(qrCodeSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: "tg://login?token=replacement" }),
      undefined,
    );
    expect(loginWithQr).toHaveBeenCalledTimes(1);
  });

  it("returns the authoritative account after successful authorization", async () => {
    const onConnected = vi.fn();
    loginWithQr.mockResolvedValue({
      success: true,
      status: "connected",
      account: connectedAccount,
    });

    render(
      <TelegramAccountQrModal
        open
        account={account}
        onClose={vi.fn()}
        onConnected={onConnected}
        onNeedPassword={vi.fn()}
      />,
    );

    await waitFor(() => expect(onConnected).toHaveBeenCalledWith(connectedAccount));
  });

  it("updates the account as soon as persistence completes, before the stream ends", async () => {
    let onProgress:
      | ((item: { type: "connected"; account: typeof connectedAccount }) => void)
      | undefined;
    const onConnected = vi.fn();
    loginWithQr.mockImplementation(
      (_id: string, progress: typeof onProgress) => {
        onProgress = progress;
        return pendingRequest();
      },
    );

    render(
      <TelegramAccountQrModal
        open
        account={account}
        onClose={vi.fn()}
        onConnected={onConnected}
        onNeedPassword={vi.fn()}
      />,
    );
    await waitFor(() => expect(loginWithQr).toHaveBeenCalledTimes(1));

    act(() =>
      onProgress?.({ type: "connected", account: connectedAccount }),
    );

    expect(onConnected).toHaveBeenCalledWith(connectedAccount);
  });

  it("transitions to the existing 2FA flow", async () => {
    const onNeedPassword = vi.fn();
    loginWithQr.mockResolvedValue({
      success: true,
      status: "needs_password",
    });

    render(
      <TelegramAccountQrModal
        open
        account={account}
        onClose={vi.fn()}
        onConnected={vi.fn()}
        onNeedPassword={onNeedPassword}
      />,
    );

    await waitFor(() => expect(onNeedPassword).toHaveBeenCalledTimes(1));
  });

  it("aborts cancellation without showing a false error", async () => {
    let signal: AbortSignal | undefined;
    loginWithQr.mockImplementation(
      (_id: string, _progress: unknown, requestSignal: AbortSignal) => {
        signal = requestSignal;
        return new Promise((_resolve, reject) => {
          requestSignal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        });
      },
    );
    const onClose = vi.fn();

    render(
      <TelegramAccountQrModal
        open
        account={account}
        onClose={onClose}
        onConnected={vi.fn()}
        onNeedPassword={vi.fn()}
      />,
    );
    await waitFor(() => expect(loginWithQr).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(signal?.aborted).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a retryable terminal error and starts one replacement request", async () => {
    let firstSignal: AbortSignal | undefined;
    loginWithQr
      .mockImplementationOnce(
        (_id: string, _progress: unknown, signal: AbortSignal) => {
          firstSignal = signal;
          return Promise.reject(new Error("Telegram QR authorization expired"));
        },
      )
      .mockImplementationOnce(pendingRequest);

    render(
      <TelegramAccountQrModal
        open
        account={account}
        onClose={vi.fn()}
        onConnected={vi.fn()}
        onNeedPassword={vi.fn()}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Telegram QR authorization expired",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(loginWithQr).toHaveBeenCalledTimes(2));
    expect(firstSignal?.aborted).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("Preparing QR code");
  });
});

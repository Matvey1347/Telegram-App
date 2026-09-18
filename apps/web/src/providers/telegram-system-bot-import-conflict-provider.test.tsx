import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import {
  TelegramSystemBotImportConflictProvider,
  useTelegramSystemBotImportConflict,
} from "./telegram-system-bot-import-conflict-provider";

function Consumer() {
  const confirmReplacement = useTelegramSystemBotImportConflict();
  const [answer, setAnswer] = useState("none");
  return (
    <>
      <button
        type="button"
        onClick={() =>
          void confirmReplacement().then((confirmed) =>
            setAnswer(confirmed ? "confirmed" : "cancelled"),
          )
        }
      >
        Start import
      </button>
      <span>{answer}</span>
    </>
  );
}

describe("TelegramSystemBotImportConflictProvider", () => {
  it("uses an in-app confirmation before replacing an unfinished import", async () => {
    render(
      <TelegramSystemBotImportConflictProvider>
        <Consumer />
      </TelegramSystemBotImportConflictProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start import" }));
    expect(
      screen.getByRole("heading", { name: "Replace active bot import?" }),
    ).toBeVisible();
    expect(
      screen.getByText(/cancel and delete the previous one/i),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Replace import" }));
    expect(await screen.findByText("confirmed")).toBeVisible();
  });

  it("keeps the existing import when the user cancels", async () => {
    render(
      <TelegramSystemBotImportConflictProvider>
        <Consumer />
      </TelegramSystemBotImportConflictProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start import" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByText("cancelled")).toBeVisible();
  });
});

import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { AiPostingDictation } from "./ai-posting-dictation";

afterEach(() => vi.unstubAllGlobals());

function Field() {
  const [value, setValue] = useState("Уже написано");
  return (
    <AiPostingDictation
      value={value}
      onChange={setValue}
      label="Правка"
      placeholder="Текст"
    />
  );
}

it("updates interim speech without duplicating it, and keeps final text", () => {
  let instance: {
    interimResults: boolean;
    onresult?: (event: unknown) => void;
    onend?: () => void;
    stop: () => void;
    abort: () => void;
  };
  class FakeRecognition {
    interimResults = false;
    onresult?: (event: unknown) => void;
    onend?: () => void;
    start = vi.fn();
    stop = vi.fn();
    abort = vi.fn();
    constructor() {
      // The fake constructor exposes the browser-created instance to the test.
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      instance = this;
    }
  }
  vi.stubGlobal("SpeechRecognition", FakeRecognition);
  render(<Field />);
  fireEvent.click(screen.getByRole("button", { name: "Надиктовать правки" }));
  expect(instance!.interimResults).toBe(true);
  expect(screen.getByRole("status")).toHaveTextContent("Идёт диктовка");
  act(() =>
    instance!.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: false, 0: { transcript: "Добавьте" } }],
    }),
  );
  expect(screen.getByRole("textbox")).toHaveValue("Уже написано Добавьте");
  act(() =>
    instance!.onresult?.({
      resultIndex: 0,
      results: [
        { isFinal: true, 0: { transcript: "Добавьте пример" } },
        { isFinal: false, 0: { transcript: "пожалуйста" } },
      ],
    }),
  );
  expect(screen.getByRole("textbox")).toHaveValue(
    "Уже написано Добавьте пример пожалуйста",
  );
  fireEvent.click(screen.getByRole("button", { name: "Остановить диктовку" }));
  expect(instance!.stop).toHaveBeenCalled();
  act(() => instance!.onend?.());
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("stops recognition before manual edits to avoid overwriting them", () => {
  let instance: {
    onresult?: ((event: unknown) => void) | null;
    stop: () => void;
    abort: () => void;
  };
  class FakeRecognition {
    onresult?: ((event: unknown) => void) | null;
    start = vi.fn();
    stop = vi.fn();
    abort = vi.fn();
    constructor() {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      instance = this;
    }
  }
  vi.stubGlobal("SpeechRecognition", FakeRecognition);
  render(<Field />);
  fireEvent.click(screen.getByRole("button", { name: "Надиктовать правки" }));
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Ручная правка" },
  });
  expect(instance!.stop).toHaveBeenCalled();
  expect(instance!.onresult).toBeNull();
  expect(screen.getByRole("textbox")).toHaveValue("Ручная правка");
});

it("explains when browser speech recognition is unavailable", () => {
  vi.stubGlobal("SpeechRecognition", undefined);
  vi.stubGlobal("webkitSpeechRecognition", undefined);
  render(<Field />);
  fireEvent.click(screen.getByRole("button", { name: "Надиктовать правки" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Диктовка недоступна");
});

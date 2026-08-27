import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canonicalizeTimeInputValue,
  CustomSelect,
  CurrencySelect,
  isValidTimeInputValue,
  Input,
  MasonryGrid,
  Modal,
  MultiSelect,
  Tooltip,
} from "@/components/ui/primitives";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MasonryGrid", () => {
  it("measures every card independently instead of using the tallest row", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserverMock {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        const height = this.textContent === "Tall card" ? 220 : 120;
        return {
          bottom: height,
          height,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        };
      },
    );

    const { container } = render(
      <MasonryGrid>
        <article>Tall card</article>
        <article>Short card</article>
      </MasonryGrid>,
    );

    const grid = container.firstElementChild;
    const tallItem = screen.getByText("Tall card").parentElement?.parentElement;
    const shortItem =
      screen.getByText("Short card").parentElement?.parentElement;

    expect(grid).toHaveClass("grid", "[grid-auto-rows:1px]", "gap-x-4");
    expect(tallItem).toHaveStyle({ gridRowEnd: "span 220" });
    expect(shortItem).toHaveStyle({ gridRowEnd: "span 120" });
    expect(tallItem).toHaveClass("md:col-start-1", "xl:col-start-1");
    expect(shortItem).toHaveClass("md:col-start-2", "xl:col-start-2");
  });
});

describe("Modal", () => {
  it("renders an action beside the dialog title", () => {
    render(
      <Modal
        open
        onClose={vi.fn()}
        title="Import managed posts"
        headerAction={<button type="button">Copy GPT prompt</button>}
      >
        Import form
      </Modal>,
    );

    expect(
      screen.getByRole("button", { name: "Copy GPT prompt" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("dialog", { name: "Import managed posts" }),
    ).toBeInTheDocument();
  });

  it("exposes dialog semantics, closes on Escape, and restores focus", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(
      <Modal
        open
        onClose={onClose}
        title="Edit account"
        closeLabel="Close dialog"
      >
        <button type="button">Save</button>
      </Modal>,
    );

    expect(screen.getByRole("dialog", { name: "Edit account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close dialog" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});

describe("CustomSelect", () => {
  it("marks Telegram Premium emoji instead of presenting it as plain unicode", () => {
    render(
      <CustomSelect
        value="premium"
        onChange={() => {}}
        searchable={false}
        options={[
          {
            value: "premium",
            label: "Premium workspace",
            iconEmoji: "💬",
            iconPremium: true,
          },
        ]}
      />,
    );

    expect(screen.getByLabelText("Telegram Premium emoji")).toBeTruthy();
  });

  it("renders the dropdown in a fixed overlay layer above surrounding layout", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CustomSelect
        value="draft"
        onChange={() => {}}
        searchable={false}
        options={[
          { value: "draft", label: "Draft" },
          { value: "publish", label: "Publish" },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /draft/i }));

    const option = await screen.findByRole("button", { name: /publish/i });
    expect(container).not.toContainElement(option);
    expect(option.closest("div")?.className).toContain("z-[120]");
  });
});

describe("MultiSelect", () => {
  it("renders its options in an adaptive overlay outside modal clipping", async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 760,
      height: 40,
      left: 100,
      right: 500,
      top: 720,
      width: 400,
      x: 100,
      y: 720,
      toJSON: () => ({}),
    });

    const { container } = render(
      <MultiSelect
        value={[]}
        onChange={() => {}}
        options={[{ value: "channel-1", label: "Test channel" }]}
        placeholder="No channels excluded"
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /no channels excluded/i }),
    );

    const option = await screen.findByRole("button", { name: "Test channel" });
    expect(container).not.toContainElement(option);
    expect(option.parentElement?.parentElement?.style.position).toBe("fixed");
  });

  it("shows avatars without channel-name chips for a large selection", () => {
    render(
      <MultiSelect
        value={["channel-1", "channel-2", "channel-3"]}
        onChange={() => {}}
        options={[
          { value: "channel-1", label: "First", iconFallback: "F" },
          { value: "channel-2", label: "Second", iconFallback: "S" },
          { value: "channel-3", label: "Third", iconFallback: "T" },
        ]}
      />,
    );

    expect(screen.getByLabelText("3 options selected")).toBeInTheDocument();
    expect(screen.queryByText("First")).not.toBeInTheDocument();
    expect(screen.queryByText("Second")).not.toBeInTheDocument();
    expect(screen.queryByText("Third")).not.toBeInTheDocument();
  });
});

describe("CurrencySelect", () => {
  it("shows the flag, symbol, and ISO code for each currency", async () => {
    const user = userEvent.setup();
    render(
      <CurrencySelect
        value="USD"
        currencies={["USD", "UAH", "PLN", "FJD", "FKP", "GHS", "GIP", "GMD"]}
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: /🇺🇸.*USD.*\$/u })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /🇺🇸.*USD.*\$/u }));
    expect(screen.getByRole("button", { name: /🇺🇦.*UAH.*₴/u })).toBeTruthy();
    expect(screen.getByRole("button", { name: /🇵🇱.*PLN.*zł/u })).toBeTruthy();
    expect(screen.getByRole("button", { name: /🇫🇯.*FJD.*\$/u })).toBeTruthy();
    expect(screen.getByRole("button", { name: /🇫🇰.*FKP.*£/u })).toBeTruthy();
    expect(screen.getByRole("button", { name: /🇬🇭.*GHS.*GH₵/u })).toBeTruthy();
    expect(screen.getByRole("button", { name: /🇬🇮.*GIP.*£/u })).toBeTruthy();
    expect(screen.getByRole("button", { name: /🇬🇲.*GMD.*D/u })).toBeTruthy();
  });
});

describe("Tooltip", () => {
  it("renders content through a portal and closes on Escape", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div className="overflow-hidden">
        <Tooltip content="Helpful tab description">
          <button type="button">Info</button>
        </Tooltip>
      </div>,
    );

    await user.hover(screen.getByRole("button", { name: "Info" }));

    const tooltip = await screen.findByText("Helpful tab description");
    expect(container).not.toContainElement(tooltip);

    await user.keyboard("{Escape}");
    expect(screen.queryByText("Helpful tab description")).toBeNull();
  });
});

describe("Input", () => {
  it("lets users reveal and hide every password field", async () => {
    const user = userEvent.setup();
    render(<Input type="password" defaultValue="secret-value" />);

    const input = screen.getByDisplayValue("secret-value");
    expect(input).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
  });
});

describe("time input helpers", () => {
  it("accepts single-digit hours and canonicalizes them for saving", () => {
    expect(canonicalizeTimeInputValue("8:15")).toBe("08:15");
    expect(isValidTimeInputValue("8:15")).toBe(true);
  });

  it("rejects incomplete or out-of-range times", () => {
    expect(canonicalizeTimeInputValue("8:1")).toBeNull();
    expect(canonicalizeTimeInputValue("24:00")).toBeNull();
    expect(isValidTimeInputValue("24:00")).toBe(false);
  });
});

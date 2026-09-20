import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { Plus } from "lucide-react";
import {
  canonicalizeTimeInputValue,
  ConfirmDeleteModal,
  Button,
  CustomSelect,
  CurrencySelect,
  DateInput,
  DateRangeInput,
  isValidTimeInputValue,
  localDateTimeInputToIso,
  Input,
  MasonryGrid,
  Modal,
  MultiSelect,
  TimeInput,
  Tooltip,
} from "@/components/ui/primitives";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MasonryGrid", () => {
  it("measures cards independently and leaves their column available for dense packing", () => {
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

    expect(grid).toHaveClass(
      "grid",
      "grid-flow-row-dense",
      "[grid-auto-rows:1px]",
      "gap-x-4",
    );
    expect(tallItem).toHaveStyle({ gridRowEnd: "span 220" });
    expect(shortItem).toHaveStyle({ gridRowEnd: "span 120" });
    expect(tallItem).not.toHaveClass("md:col-start-1", "xl:col-start-1");
    expect(shortItem).not.toHaveClass("md:col-start-2", "xl:col-start-2");
  });
});

describe("Modal", () => {
  it("renders a shared styled title icon when a feature does not provide one", () => {
    render(
      <Modal open onClose={vi.fn()} title="Create promo">
        Promo form
      </Modal>,
    );

    const iconBadge = screen
      .getByRole("dialog", { name: "Create promo" })
      .querySelector('[data-modal-title-icon="true"]');
    expect(iconBadge).toBeInTheDocument();
    expect(iconBadge?.querySelector(".lucide-images")).toBeInTheDocument();
    expect(iconBadge?.querySelector(".lucide-plus")).not.toBeInTheDocument();
  });

  it("portals the dialog outside page stacking contexts", () => {
    const { container } = render(
      <div className="relative z-50">
        Page panel
        <Modal open onClose={vi.fn()} title="Channel import">
          Import form
        </Modal>
      </div>,
    );

    const dialog = screen.getByRole("dialog", { name: "Channel import" });
    expect(container).not.toContainElement(dialog);
    expect(document.body).toContainElement(dialog);
  });

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

describe("Button", () => {
  it("adds an icon to textual creation actions without duplicating an existing icon", () => {
    const { rerender } = render(<Button>Create promo</Button>);
    expect(
      screen
        .getByRole("button", { name: "Create promo" })
        .querySelector('[data-create-action-icon="true"]'),
    ).toBeInTheDocument();

    rerender(
      <Button>
        <Plus data-testid="provided-icon" /> Create promo
      </Button>,
    );
    expect(screen.getByTestId("provided-icon")).toBeInTheDocument();
    expect(
      screen
        .getByRole("button", { name: "Create promo" })
        .querySelector('[data-create-action-icon="true"]'),
    ).not.toBeInTheDocument();
  });
});

describe("ConfirmDeleteModal", () => {
  it("uses one-click confirmation instead of requiring the entity name", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDeleteModal
        open
        onClose={vi.fn()}
        onConfirm={onConfirm}
        entityName="Main plan"
      />,
    );

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    const remove = screen.getByRole("button", { name: "Confirm deletion" });
    await user.click(remove);
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe("CustomSelect", () => {
  it("keeps a long selected label and URL inside the mobile trigger", () => {
    const { container } = render(
      <div className="w-72">
        <CustomSelect
          value="invite"
          onChange={() => {}}
          searchable={false}
          options={[
            {
              value: "invite",
              label: "Imported MTProto link · Default for a very long channel",
              meta: "https://t.me/+a-very-long-invite-link-that-must-not-widen-the-modal",
            },
          ]}
        />
      </div>,
    );

    const trigger = screen.getByRole("button", {
      name: /Imported MTProto link/i,
    });
    expect(trigger.parentElement).toHaveClass("min-w-0", "max-w-full");
    expect(trigger).toHaveClass("min-w-0", "max-w-full", "overflow-hidden");
    expect(container.querySelector("bdi")).toHaveClass(
      "min-w-0",
      "max-w-[45%]",
      "truncate",
    );
  });

  it("renders visual option content while retaining a searchable text label", async () => {
    render(
      <CustomSelect
        value="invite"
        onChange={() => {}}
        searchPlaceholder="Search invite links"
        options={[
          {
            value: "invite",
            label: "Campaign link · Folders",
            labelContent: (
              <span>
                Campaign link <span aria-label="Folders">📁</span>
              </span>
            ),
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("button", { name: /Campaign link.*Folders/ }),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: /Campaign link.*Folders/ }),
    );
    expect(screen.getByPlaceholderText("Search invite links")).toBeVisible();
    expect(screen.getAllByLabelText("Folders")).toHaveLength(2);
  });

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

  it("offers a typed value to an async create handler", async () => {
    const user = userEvent.setup();
    const onCreateOption = vi.fn().mockResolvedValue(undefined);
    render(
      <CustomSelect
        value="existing"
        onChange={() => {}}
        options={[{ value: "existing", label: "Existing" }]}
        canCreateOption={(search) => search.startsWith("https://t.me/+")}
        createOptionLabel={() => "Verify and add invite link"}
        onCreateOption={onCreateOption}
      />,
    );

    await user.click(screen.getByRole("button", { name: /existing/i }));
    await user.type(
      screen.getByPlaceholderText("Search…"),
      "https://t.me/+legacy",
    );
    await user.click(
      screen.getByRole("button", { name: "Verify and add invite link" }),
    );

    expect(onCreateOption).toHaveBeenCalledWith("https://t.me/+legacy");
  });

  it("shows async option loading in both the trigger and open dropdown", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(
      <CustomSelect
        value=""
        onChange={() => {}}
        options={[]}
        loading
        loadingLabel="Loading invite links…"
        onOpen={onOpen}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Loading invite links…" }),
    );
    expect(onOpen).toHaveBeenCalledOnce();
    expect(screen.getAllByText("Loading invite links…")).toHaveLength(2);
  });

  it("shows search for a short option list when a search placeholder is requested", async () => {
    const user = userEvent.setup();
    render(
      <CustomSelect
        value="bot"
        onChange={() => {}}
        options={[
          { value: "bot", label: "Bot link" },
          { value: "folder", label: "Folder link" },
          { value: "vp", label: "VP link" },
        ]}
        searchPlaceholder="Search invite links"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Bot link" }));

    expect(
      screen.getByPlaceholderText("Search invite links"),
    ).toBeInTheDocument();
  });

  it("allows onOpen to update its parent without updating during CustomSelect render", async () => {
    const user = userEvent.setup();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    function Harness() {
      const [opened, setOpened] = useState(false);
      return (
        <>
          <span>{opened ? "requested" : "idle"}</span>
          <CustomSelect
            value=""
            onChange={() => {}}
            options={[]}
            onOpen={() => setOpened(true)}
          />
        </>
      );
    }
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Select" }));

    expect(screen.getByText("requested")).toBeTruthy();
    expect(
      consoleError.mock.calls.some((call) =>
        String(call[0]).includes("Cannot update a component"),
      ),
    ).toBe(false);
  });
});

describe("MultiSelect", () => {
  it("does not let long selected chips define a wider intrinsic trigger", () => {
    render(
      <MultiSelect
        value={["channel-1"]}
        onChange={() => {}}
        options={[
          {
            value: "channel-1",
            label: "A channel title that is much wider than a phone viewport",
          },
        ]}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: /A channel title that is much wider/i,
    });
    expect(trigger.parentElement).toHaveClass("min-w-0", "max-w-full");
    expect(trigger).toHaveClass("min-w-0", "max-w-full", "overflow-hidden");
  });

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

  it("can import a typed option directly from its dropdown", async () => {
    const user = userEvent.setup();
    const onCreateOption = vi.fn().mockResolvedValue(undefined);
    render(
      <MultiSelect
        value={[]}
        onChange={() => {}}
        options={[]}
        placeholder="Partner channels"
        searchPlaceholder="Search or paste a Telegram channel link"
        createOptionLabel={() => "Import and select this channel"}
        onCreateOption={onCreateOption}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Partner channels" }));
    await user.type(
      screen.getByPlaceholderText("Search or paste a Telegram channel link"),
      "https://t.me/partner",
    );
    await user.click(
      screen.getByRole("button", { name: "Import and select this channel" }),
    );

    expect(onCreateOption).toHaveBeenCalledWith("https://t.me/partner");
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

describe("DateRangeInput", () => {
  it("renders its calendar through a portal outside clipping containers", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div className="overflow-hidden">
        <DateRangeInput from="" to="" onChange={() => {}} />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Select period" }));

    const calendar = screen.getByRole("dialog", { name: "Select period" });
    expect(container).not.toContainElement(calendar);
    expect(calendar).toHaveStyle({ position: "fixed" });
  });
});

describe("DateInput", () => {
  it("renders its calendar through a fixed portal above modal clipping", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div className="overflow-hidden">
        <DateInput value="2026-09-13" onChange={() => {}} />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "13.09.2026" }));

    const calendar = screen.getByRole("dialog", { name: "Select start date" });
    expect(container).not.toContainElement(calendar);
    expect(calendar).toHaveStyle({ position: "fixed" });
    expect(calendar).toHaveClass("z-[220]");
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
  it("keeps a partially edited time stable when a middle digit is removed", async () => {
    const user = userEvent.setup();
    render(<TimeInput aria-label="Publication time" defaultValue="12:34" />);

    const input = screen.getByRole("textbox", {
      name: "Publication time",
    }) as HTMLInputElement;
    await user.click(input);
    input.setSelectionRange(1, 2);
    await user.keyboard("{Backspace}");

    expect(input).toHaveValue("1:34");
    expect(localDateTimeInputToIso("2026-09-13", input.value)).not.toBeNull();
  });

  it("accepts single-digit hours and canonicalizes them for saving", () => {
    expect(canonicalizeTimeInputValue("8:15")).toBe("08:15");
    expect(isValidTimeInputValue("8:15")).toBe(true);
  });

  it("rejects incomplete or out-of-range times", () => {
    expect(canonicalizeTimeInputValue("8:1")).toBeNull();
    expect(canonicalizeTimeInputValue("24:00")).toBeNull();
    expect(isValidTimeInputValue("24:00")).toBe(false);
  });

  it("never serializes a partial time and canonicalizes single-digit hours", () => {
    expect(localDateTimeInputToIso("2026-09-13", "8:15")).toBe(
      new Date("2026-09-13T08:15:00").toISOString(),
    );
    expect(localDateTimeInputToIso("2026-09-13", "8:1")).toBeNull();
  });
});

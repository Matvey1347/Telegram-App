import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TelegramChannelMessageTemplatesModal } from "./telegram-channel-message-templates-modal";
import type { TelegramChannel, TelegramChannelNetwork } from "@/lib/api";
import {
  normalizeTelegramChannelMessageTemplateDraft,
  TELEGRAM_MESSAGE_TEMPLATE_DRAFT_NAMESPACE,
} from "./telegram-channel-message-template-draft";
import { writeWorkspaceModalDraft } from "@/lib/workspace-modal-drafts";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  source: vi.fn(),
  remove: vi.fn(),
  sendPostPreview: vi.fn(),
  pushToast: vi.fn(),
}));

vi.mock(
  "@/lib/features/telegram/telegram-channel-message-templates-api",
  () => ({
    telegramMessageTemplateKeys: {
      all: ["templates"],
      list: () => ["templates", "list"],
      source: (ids: string[]) => ["templates", "source", ...ids],
    },
    telegramChannelMessageTemplatesApi: {
      list: mocks.list,
      source: mocks.source,
      remove: mocks.remove,
    },
  }),
);
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    telegramSystemBotApi: { sendPostPreview: mocks.sendPostPreview },
  };
});
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast: mocks.pushToast }),
}));

const savedTemplate = {
  id: "template-1",
  title: "All Channels",
  iconId: null,
  iconPresentation: { type: "unicode", value: "🧾" },
  scopeMode: "CHANNELS",
  networkId: null,
  channelIds: ["channel-1"],
  bodyTemplate: "{{#channels}}{{title}}{{/channels}}",
  overrideInviteLinks: false,
  inviteLinkOverrides: {},
  excludedProductNames: [],
  priceRounding: "NEAREST_10",
  productNameOverrides: { "No auto-delete": "Без видалення" },
  bundleOfferEnabled: true,
  bundleDiscountPercent: 10,
  bundleBasePriceOverrides: {},
  createdAt: "2026-09-14T00:00:00.000Z",
  updatedAt: "2026-09-14T00:00:00.000Z",
};

function renderModal({
  channels = [],
  networks = [],
}: {
  channels?: TelegramChannel[];
  networks?: TelegramChannelNetwork[];
} = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TelegramChannelMessageTemplatesModal
        channels={channels}
        networks={networks}
        onClose={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("selected-workspace-id", "workspace-1");
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.list.mockResolvedValue([savedTemplate]);
  mocks.source.mockResolvedValue({
    channels: [
      {
        id: "channel-1",
        title: "Channel One",
        description: null,
        username: null,
        photoUrl: null,
        tgStatUrl: null,
        emojiSource: "📣",
        networkGroups: [],
        iconPresentation: null,
        defaultInviteLinkId: null,
        inviteLinks: [],
        products: [],
      },
    ],
  });
  mocks.sendPostPreview.mockResolvedValue({ success: true });
});

describe("TelegramChannelMessageTemplatesModal", () => {
  it("shows the standard pencil action for a local draft", async () => {
    writeWorkspaceModalDraft(
      localStorage,
      {
        namespace: TELEGRAM_MESSAGE_TEMPLATE_DRAFT_NAMESPACE,
        workspaceId: "workspace-1",
        schemaVersion: 1,
        normalize: normalizeTelegramChannelMessageTemplateDraft,
      },
      {
        id: "draft-1",
        createdAt: "2026-09-15T10:00:00.000Z",
        updatedAt: "2026-09-15T10:00:00.000Z",
        schemaVersion: 1,
        form: {
          payload: {
            title: "Draft price list",
            iconId: null,
            scopeMode: "CHANNELS",
            networkId: null,
            channelIds: [],
            bodyTemplate: "{{#channels}}{{title}}{{/channels}}",
            overrideInviteLinks: false,
            inviteLinkOverrides: {},
          },
          savedTemplateId: null,
        },
        preview: { title: "Draft price list" },
      },
    );
    renderModal();

    const editDraft = await screen.findByRole("button", {
      name: /Continue draft/,
    });
    expect(editDraft).toHaveClass("border-neutral-700");

    await userEvent.click(editDraft);
    expect(
      screen.getByRole("button", { name: "Back to templates" }),
    ).toBeInTheDocument();
  });

  it("shows the template emoji and standard actions, including direct send", async () => {
    const user = userEvent.setup();
    renderModal();

    expect(await screen.findByText("🧾")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit template" })).toHaveClass(
      "border-neutral-700",
    );
    expect(screen.getByRole("button", { name: "Delete template" })).toHaveClass(
      "border-red-700",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Send All Channels to System Bot",
      }),
    );

    await waitFor(() =>
      expect(mocks.source).toHaveBeenCalledWith({ channelIds: ["channel-1"] }),
    );
    expect(mocks.sendPostPreview).toHaveBeenCalledWith(
      expect.objectContaining({ title: "All Channels", text: "Channel One" }),
    );
  });

  it("keeps only one template actions menu open", async () => {
    const user = userEvent.setup();
    mocks.list.mockResolvedValue([
      savedTemplate,
      { ...savedTemplate, id: "template-2", title: "Second template" },
    ]);
    renderModal();

    await user.click(
      await screen.findByRole("button", {
        name: "Template actions for All Channels",
      }),
    );
    expect(screen.getAllByRole("menu")).toHaveLength(1);

    await user.click(
      screen.getByRole("button", {
        name: "Template actions for Second template",
      }),
    );
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(
      screen.getByRole("menuitem", {
        name: "Send Second template to System Bot",
      }),
    ).toBeInTheDocument();
  });

  it("opens a duplicate as a new editable template", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(
      await screen.findByRole("button", { name: "Duplicate All Channels" }),
    );

    expect(screen.getByDisplayValue("All Channels copy")).toBeVisible();
    expect(screen.getByText("Draft saved automatically")).toBeVisible();
  });

  it("shows only a preview skeleton and never creates a draft while editing a saved template", async () => {
    const user = userEvent.setup();
    mocks.source.mockReturnValue(new Promise(() => {}));
    renderModal({
      channels: [{ id: "channel-1", title: "Channel One" } as TelegramChannel],
    });

    await user.click(
      await screen.findByRole("button", { name: "Edit template" }),
    );

    expect(
      screen.getByRole("status", { name: "Loading message template preview" }),
    ).toBeVisible();
    expect(screen.getByText("Changes are applied after saving")).toBeVisible();
    expect(
      screen.queryByText("Draft saved automatically"),
    ).not.toBeInTheDocument();
    expect(mocks.pushToast).not.toHaveBeenCalled();
    expect(
      localStorage.getItem(
        `${TELEGRAM_MESSAGE_TEMPLATE_DRAFT_NAMESPACE}:workspace-1`,
      ),
    ).toBeNull();
  });

  it("requires the shared destructive confirmation before deleting a template", async () => {
    const user = userEvent.setup();
    mocks.remove.mockResolvedValue({ success: true });
    renderModal();

    await user.click(
      await screen.findByRole("button", { name: "Delete template" }),
    );
    expect(mocks.remove).not.toHaveBeenCalled();

    const confirmation = screen.getByRole("dialog", {
      name: "Confirm deletion",
    });
    expect(within(confirmation).queryByRole("textbox")).not.toBeInTheDocument();
    await user.click(
      within(confirmation).getByRole("button", { name: "Confirm deletion" }),
    );

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledOnce());
    expect(mocks.remove.mock.calls[0]?.[0]).toBe("template-1");
  });

  it("shows a live network scope and opens its channel list above the modal", async () => {
    const user = userEvent.setup();
    mocks.list.mockResolvedValue([
      { ...savedTemplate, scopeMode: "NETWORK", networkId: "network-1" },
    ]);
    renderModal({
      networks: [
        {
          id: "network-1",
          name: "Business",
          iconPresentation: { type: "unicode", value: "💼" },
          channels: [{ id: "channel-1", title: "Channel One", photoUrl: null }],
        } as TelegramChannelNetwork,
      ],
    });

    expect(await screen.findByText("Business network")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Show 1 template channels" }),
    );
    const menu = screen.getByRole("menu", {
      name: "Show 1 template channels",
    });
    expect(menu).toHaveClass("fixed", "z-[200]");
    expect(menu.parentElement).toBe(document.body);
    expect(within(menu).getByText("Channel One")).toBeVisible();
  });
});

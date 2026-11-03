import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/providers/i18n-provider";
import { ChannelReminderModal } from "./channel-reminder-modal";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  assign: vi.fn(),
  channels: vi.fn(),
  members: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/lib/features/telegram/channel-reminders-api", () => ({
  channelRemindersApi: {
    list: mocks.list,
    create: mocks.create,
    update: mocks.update,
    remove: mocks.remove,
    assign: mocks.assign,
  },
}));
vi.mock("@/lib/api", () => ({
  telegramChannelsApi: { select: mocks.channels },
  workspaceMembersApi: { select: mocks.members },
}));
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast: mocks.toast }),
}));
vi.mock("@/components/icons/icon-picker", () => ({
  IconPicker: ({ onChange }: { onChange: (id: string, icon: unknown) => void }) => (
    <button
      type="button"
      onClick={() => onChange("icon-1", { type: "unicode", value: "🔔" })}
    >
      Choose icon
    </button>
  ),
}));

function setup(locale: "en" | "ru" = "en") {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={client}>
      <I18nProvider initialLocale={locale}>
        <ChannelReminderModal onClose={() => {}} />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue({
    templates: [
      {
        id: "template-1",
        name: "Daily",
        iconId: "icon-1",
        iconPresentation: { type: "unicode", value: "🔔" },
        daysBefore: [3, 1],
        notifyEmpty: true,
      },
    ],
    assignments: [
      { channelId: "channel-1", templateId: "template-1", memberId: "member-1" },
    ],
  });
  mocks.channels.mockResolvedValue([
    {
      id: "channel-1",
      title: "News",
      photoUrl: "https://images.example.test/channel-news.jpg",
      presentationIconPresentation: { type: "unicode", value: "🗞️" },
    },
    {
      id: "channel-2",
      title: "Updates",
      photoUrl: "https://images.example.test/channel-updates.jpg",
      presentationIconPresentation: { type: "unicode", value: "📣" },
    },
  ]);
  mocks.members.mockResolvedValue([
    {
      id: "member-1",
      user: { name: "Anna" },
      avatarPresentation: { type: "unicode", value: "👩" },
    },
  ]);
  mocks.assign.mockResolvedValue({});
  mocks.create.mockResolvedValue({});
  mocks.update.mockResolvedValue({});
});

describe("ChannelReminderModal", () => {
  it("uses Russian labels for templates and channel assignments", async () => {
    setup("ru");
    expect(await screen.findByText("Шаблоны напоминаний")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Новый шаблон" }));
    expect(
      screen.getByText(
        "Предупредить, когда до последнего запланированного дня осталось",
      ),
    ).toBeInTheDocument();
  });

  it("shows real channel avatars without names and keeps channel management global", async () => {
    setup();
    expect(await screen.findByText("Daily")).toBeInTheDocument();
    expect(document.querySelector('img[src="https://images.example.test/channel-news.jpg"]')).toHaveAttribute(
      "src",
      "https://images.example.test/channel-news.jpg",
    );
    expect(screen.queryByText("News")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Manage channels" }),
    ).toHaveLength(1);
  });

  it("shows an overlapping avatar for every assigned channel and opens their names", async () => {
    const user = userEvent.setup();
    mocks.list.mockResolvedValueOnce({
      templates: [
        {
          id: "template-1",
          name: "Daily",
          iconId: "icon-1",
          iconPresentation: { type: "unicode", value: "🔔" },
          daysBefore: [3, 1],
          notifyEmpty: true,
        },
      ],
      assignments: [
        { channelId: "channel-1", templateId: "template-1", memberId: "member-1" },
        { channelId: "channel-2", templateId: "template-1", memberId: "member-1" },
      ],
    });
    setup();

    const channelTrigger = await screen.findByRole("button", {
      name: "Show channels assigned to Anna: 2",
    });
    expect(
      channelTrigger.querySelectorAll('img[src^="https://images.example.test/channel-"]'),
    ).toHaveLength(2);
    expect(screen.queryByText("News")).not.toBeInTheDocument();
    expect(screen.queryByText("Updates")).not.toBeInTheDocument();

    await user.click(channelTrigger);
    const menu = await screen.findByRole("menu", {
      name: "Show channels assigned to Anna: 2",
    });
    expect(menu).toHaveTextContent("News");
    expect(menu).toHaveTextContent("Updates");
  });

  it("applies a template to selected channels without changing responsible members", async () => {
    const user = userEvent.setup();
    mocks.list.mockResolvedValueOnce({
      templates: [
        { id: "template-1", name: "Daily", daysBefore: [3, 1], notifyEmpty: true },
        { id: "template-2", name: "Weekly", daysBefore: [3], notifyEmpty: false },
      ],
      assignments: [
        { channelId: "channel-1", templateId: "template-1", memberId: "member-1" },
        { channelId: "channel-2", templateId: "template-2", memberId: "member-1" },
      ],
    });
    setup();
    await user.click(await screen.findByRole("button", { name: "Manage channels" }));
    await user.click(screen.getByLabelText("Select all channels"));
    await user.click(screen.getAllByRole("button", { name: "Template" })[0]!);
    await user.click(screen.getByRole("option", { name: "Daily" }));
    await user.click(screen.getByRole("button", { name: "Set template for selected: 2" }));
    await user.click(screen.getByRole("button", { name: "Apply to 2 selected channels" }));

    await waitFor(() =>
      expect(mocks.assign).toHaveBeenCalledWith({
        items: [
          { channelId: "channel-1", templateId: "template-1", memberId: "member-1" },
          { channelId: "channel-2", templateId: "template-1", memberId: "member-1" },
        ],
      }),
    );
  });

  it("keeps selected channels available for retry after an assignment failure", async () => {
    const user = userEvent.setup();
    mocks.assign.mockRejectedValue(new Error("offline"));
    setup();
    await user.click(await screen.findByRole("button", { name: "Manage channels" }));
    await user.click(screen.getByLabelText("Select all channels"));
    await user.click(screen.getByRole("button", { name: "Apply to 2 selected channels" }));

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        "Could not update channel reminders",
        "error",
      ),
    );
    expect(screen.getByLabelText("Select all channels")).toBeChecked();
  });

  it("saves an edited template with its selected iconId", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(await screen.findByRole("button", { name: "Edit Daily" }));
    await user.click(screen.getByRole("button", { name: "Choose icon" }));
    await user.click(screen.getByRole("button", { name: "Save template" }));

    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith("template-1", {
        name: "Daily",
        iconId: "icon-1",
        daysBefore: [3, 1],
        notifyEmpty: true,
      }),
    );
  });

  it("keeps icon controls compact while preserving the icon size", async () => {
    const user = userEvent.setup();
    setup();
    const editButton = await screen.findByRole("button", { name: "Edit Daily" });
    expect(editButton.className).toContain("h-8 w-8");
    expect(editButton.querySelector("svg")).toBeInTheDocument();
    expect(editButton.querySelector("svg")?.getAttribute("width")).toBe("20");
    const deleteButton = screen.getByRole("button", { name: "Delete Daily" });
    expect(deleteButton.className).toContain("h-8 w-8");
    expect(deleteButton.querySelector("svg")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Manage channels" }));
    const backButton = screen.getByRole("button", { name: "Back to reminders" });
    expect(backButton.className).toContain("h-8 w-8");
    expect(backButton.querySelector("svg")).toBeInTheDocument();
    expect(backButton.querySelector("svg")?.getAttribute("width")).toBe("24");
  });
});

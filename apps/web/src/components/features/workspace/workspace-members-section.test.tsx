import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { telegramUserAccountsApi, workspaceMembersApi } from "@/lib/api";
import { workspaceRolesApi } from "@/lib/features/workspace/workspace-roles-api";
import { WorkspaceMembersSection } from "./workspace-members-section";

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ workspace: { name: "Workspace", role: "owner" } }),
}));

vi.mock("@/components/icons/icon-picker", () => ({
  IconPicker: () => <button type="button">Upload avatar</button>,
}));

describe("WorkspaceMembersSection", () => {
  const renderSection = () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceMembersSection embedded />
      </QueryClientProvider>,
    );
  };

  beforeEach(() => {
    vi.spyOn(workspaceMembersApi, "list").mockResolvedValue([
      {
        id: "member-1",
        role: "owner",
        isCurrentUser: true,
        isHidden: false,
        user: { name: "Alice", email: "alice@example.com" },
        assignedTelegramUserAccounts: [],
      },
    ] as never);
    vi.spyOn(telegramUserAccountsApi, "list").mockResolvedValue([
      {
        id: "account-1",
        label: "Primary account",
        firstName: "Matvii",
        username: "matviikpr",
        status: "connected",
        photoUrl: "https://example.com/avatar.jpg",
      },
    ] as never);
    vi.spyOn(workspaceMembersApi, "create").mockResolvedValue({} as never);
    vi.spyOn(workspaceMembersApi, "update").mockResolvedValue({} as never);
    vi.spyOn(workspaceRolesApi, "list").mockResolvedValue([
      {
        id: "role-content",
        name: "Content manager",
        systemKey: null,
        iconPresentation: { type: "unicode", value: "📝" },
      },
      {
        id: "role-reviewer",
        name: "Reviewer",
        systemKey: null,
        iconPresentation: { type: "unicode", value: "👀" },
      },
      {
        id: "role-owner",
        name: "Owner",
        systemKey: "OWNER",
        iconPresentation: { type: "unicode", value: "👑" },
      },
    ] as never);
  });

  it("uses channel-card padding and a responsive masonry layout", async () => {
    const { container } = renderSection();

    const memberName = await screen.findByText("Alice");
    const card = memberName.closest(".break-inside-avoid");
    const masonry = card?.parentElement;

    expect(masonry).toHaveClass("columns-1", "md:columns-2", "xl:columns-3");
    expect(card).toHaveClass("mb-4", "inline-block", "w-full", "!p-0");
    expect(card?.firstElementChild).toHaveClass("p-4");
    expect(container).toHaveTextContent("Owner");
  });

  it("creates a member with one selected MTProto identity", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: "Add Member" }));
    expect(screen.getAllByText("Role")).toHaveLength(1);
    expect(
      screen.getByText("Telegram identity", { selector: "p" }).parentElement
        ?.parentElement,
    ).not.toHaveClass("rounded-xl", "border");
    const identityControl = screen.getByRole("group", {
      name: "Telegram identity",
    });
    expect(identityControl).toHaveClass("inline-grid", "p-px");
    await user.type(screen.getAllByRole("textbox")[0], "new@example.com");
    await user.click(screen.getByRole("button", { name: "Connected account" }));
    await user.click(
      screen.getByRole("button", { name: "Select connected account" }),
    );
    await user.click(await screen.findByRole("button", { name: /Matvii/ }));
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(workspaceMembersApi.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new@example.com",
        roleDefinitionId: "role-content",
        telegramUsername: null,
        telegramUserAccountIds: ["account-1"],
      }),
    );
    expect(
      vi.mocked(workspaceMembersApi.create).mock.calls[0]?.[0],
    ).not.toHaveProperty("password");
  });

  it("edits a member using the real workspace roles", async () => {
    const user = userEvent.setup();
    vi.mocked(workspaceMembersApi.list).mockResolvedValue([
      {
        id: "member-2",
        role: "member",
        roleDefinitionId: "role-content",
        roleDefinition: {
          id: "role-content",
          name: "Content manager",
          systemKey: null,
          iconPresentation: { type: "unicode", value: "📝" },
        },
        isCurrentUser: false,
        isHidden: false,
        user: { name: "Bob", email: "bob@example.com" },
        assignedTelegramUserAccounts: [],
      },
    ] as never);
    renderSection();

    await user.click(
      await screen.findByRole("button", { name: "Actions for Bob" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Edit member" }));
    await user.click(screen.getByRole("button", { name: /Content manager/u }));
    await user.click(screen.getByRole("button", { name: /Reviewer/u }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(workspaceMembersApi.update).toHaveBeenCalledWith(
      "member-2",
      expect.objectContaining({ roleDefinitionId: "role-reviewer" }),
    );
  });
});

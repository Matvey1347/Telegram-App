import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceMembersApi } from "@/lib/api";
import { workspaceRolesApi } from "@/lib/features/workspace/workspace-roles-api";
import { RolesWorkspace } from "./roles-workspace";

describe("RolesWorkspace assignments", () => {
  const renderWorkspace = () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <RolesWorkspace />
      </QueryClientProvider>,
    );
  };

  beforeEach(() => {
    vi.spyOn(workspaceRolesApi, "list").mockResolvedValue([
      {
        id: "role-1",
        name: "Content manager",
        description: "Manage content",
        systemKey: null,
        mode: "ALLOWLIST",
        membersCount: 0,
        summaries: [],
      },
    ] as never);
    vi.spyOn(workspaceRolesApi, "registry").mockResolvedValue({
      access: { isOwner: true },
      features: [],
    } as never);
    vi.spyOn(workspaceMembersApi, "select").mockResolvedValue([
      {
        id: "member-1",
        user: { name: "Alice", email: "alice@example.com" },
        avatarPresentation: {
          type: "image",
          url: "https://example.com/alice.jpg",
        },
      },
    ] as never);
  });

  it("shows member avatars in the assignment picker", async () => {
    const user = userEvent.setup();
    renderWorkspace();

    await user.click(
      await screen.findByRole("button", {
        name: "Actions for Content manager",
      }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Assign members" }));

    expect(await screen.findByRole("img", { name: "Alice" })).toHaveAttribute(
      "src",
      "https://example.com/alice.jpg",
    );
  });

  it("uses navigation and permission icons without generated access prose", async () => {
    const user = userEvent.setup();
    vi.mocked(workspaceRolesApi.list).mockResolvedValue([
      {
        id: "role-1",
        name: "Content manager",
        description: "Manage content",
        systemKey: null,
        mode: "ALLOWLIST",
        membersCount: 2,
        permissionKeys: [
          "posts.view",
          "posts.editAny",
          "posts.deleteAny",
          "posts.schedule",
        ],
        summaries: [{ featureId: "posts", level: "manage" }],
      },
    ] as never);
    vi.mocked(workspaceRolesApi.registry).mockResolvedValue({
      access: { isOwner: true },
      features: [
        {
          id: "posts",
          permissions: [
            { id: "posts.view", capability: "view", sensitivity: "standard" },
            {
              id: "posts.editAny",
              capability: "editAny",
              sensitivity: "standard",
            },
            {
              id: "posts.deleteAny",
              capability: "deleteAny",
              sensitivity: "standard",
            },
            {
              id: "posts.schedule",
              capability: "schedule",
              sensitivity: "standard",
            },
          ],
        },
      ],
    } as never);
    const { container } = renderWorkspace();

    const capabilities = await screen.findByLabelText("Role capabilities");
    expect(within(capabilities).getByText("Full access")).toBeInTheDocument();
    expect(within(capabilities).getByText("Edit")).toBeInTheDocument();
    expect(within(capabilities).getByText("Delete")).toBeInTheDocument();
    expect(within(capabilities).getByText("Schedule")).toBeInTheDocument();
    expect(screen.queryByText(/Access to posts/u)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Full protected access/u),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Actions for Content manager" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Edit role" }));
    expect(container.querySelector(".lucide-send")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "No access" }).querySelector("svg"),
    ).toHaveClass("lucide-eye-off");
    expect(
      screen.getByRole("button", { name: "View" }).querySelector("svg"),
    ).toHaveClass("lucide-eye");
    expect(
      screen.getByRole("button", { name: "Own data" }).querySelector("svg"),
    ).toHaveClass("lucide-user-round");
    expect(
      screen.getByRole("button", { name: "Full access" }).querySelector("svg"),
    ).toHaveClass("lucide-shield-check");
  });
});

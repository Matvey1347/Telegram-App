import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { workspacesApi } from "@/lib/api";
import { NotificationNavigationCoordinator } from "./notification-navigation-coordinator";

const { replace, search } = vi.hoisted(() => ({
  replace: vi.fn(),
  search: { value: new URLSearchParams() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => search.value,
}));
vi.mock("@/lib/api", () => ({
  workspacesApi: { list: vi.fn() },
  withFreshApiReads: (run: () => Promise<unknown>) => run(),
}));

function renderCoordinator(client = new QueryClient()) {
  render(
    <QueryClientProvider client={client}>
      <NotificationNavigationCoordinator>
        <div>Target CRM surface</div>
      </NotificationNavigationCoordinator>
    </QueryClientProvider>,
  );
  return client;
}

describe("NotificationNavigationCoordinator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    search.value = new URLSearchParams("workspaceId=workspace-new");
  });

  it("withholds the target, validates membership, and clears old workspace data", async () => {
    localStorage.setItem("selected-workspace-id", "workspace-old");
    let resolveWorkspaces: ((value: Array<{ id: string }>) => void) | undefined;
    vi.mocked(workspacesApi.list).mockReturnValue(
      new Promise((resolve) => {
        resolveWorkspaces = resolve;
      }) as never,
    );
    const client = new QueryClient();
    client.setQueryData(["telegram-crm", "contact", "old"], { id: "old" });
    renderCoordinator(client);

    expect(screen.getByText("Switching workspace…")).toBeInTheDocument();
    expect(screen.queryByText("Target CRM surface")).not.toBeInTheDocument();
    resolveWorkspaces?.([{ id: "workspace-new" }]);

    expect(await screen.findByText("Target CRM surface")).toBeInTheDocument();
    expect(localStorage.getItem("selected-workspace-id")).toBe("workspace-new");
    expect(
      client.getQueryData(["telegram-crm", "contact", "old"]),
    ).toBeUndefined();
    expect(workspacesApi.list).toHaveBeenCalledOnce();
  });

  it("restores the previous workspace and never mounts a denied target", async () => {
    localStorage.setItem("selected-workspace-id", "workspace-old");
    vi.mocked(workspacesApi.list).mockResolvedValue([
      { id: "workspace-old" },
    ] as never);
    renderCoordinator();

    expect(
      await screen.findByText("Workspace access unavailable"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Target CRM surface")).not.toBeInTheDocument();
    expect(localStorage.getItem("selected-workspace-id")).toBe("workspace-old");
  });

  it("renders a current-workspace target without another membership read", async () => {
    localStorage.setItem("selected-workspace-id", "workspace-new");
    renderCoordinator();
    await waitFor(() =>
      expect(screen.getByText("Target CRM surface")).toBeInTheDocument(),
    );
    expect(workspacesApi.list).not.toHaveBeenCalled();
  });
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { Button, PageHeader } from "@/components/ui/primitives";
import { AppShellWorkspaceContext } from "@/providers/app-shell-workspace";
import { LegacyCreativeLinkRedirect } from "@/components/features/workspace/creatives/legacy-creative-link-redirect";
import { workspaceCreativesApi } from "@/lib/features/workspace/workspace-creatives-api";
import { AdsHeaderActions } from "./ads-header-actions";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/providers/i18n-provider", () => ({
  useI18n: () => ({ locale: "en" }),
  useOptionalI18n: () => null,
}));
vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast: vi.fn() }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  replace.mockClear();
  window.history.replaceState(null, "", "/");
});

it("opens the encyclopedia from the Promo header beside the create action", async () => {
  const user = userEvent.setup();
  const list = vi.spyOn(workspaceCreativesApi, "list").mockResolvedValue({
    items: [],
    nextCursor: null,
  });
  const create = vi.fn();

  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppShellWorkspaceContext.Provider
        value={{
          workspaceId: "studio",
          availableWorkspaces: [{ id: "studio" }],
          onSwitchWorkspace: vi.fn(),
        }}
      >
        <PageHeader
          title="Promo creatives"
          action={
            <AdsHeaderActions>
              <Button onClick={create}>Create promo</Button>
            </AdsHeaderActions>
          }
        />
      </AppShellWorkspaceContext.Provider>
    </QueryClientProvider>,
  );

  const encyclopedia = screen.getByRole("button", {
    name: "Creative encyclopedia",
  });
  const createPromo = screen.getByRole("button", { name: "Create promo" });
  expect(encyclopedia.parentElement).toBe(createPromo.parentElement);
  expect(list).not.toHaveBeenCalled();
  await user.click(encyclopedia);
  expect(
    await screen.findByRole("dialog", { name: "Creative encyclopedia" }),
  ).toBeVisible();
  expect(await screen.findByText("No creatives here yet.")).toBeVisible();
  expect(list).toHaveBeenCalledWith(
    "studio",
    "good",
    null,
    expect.any(AbortSignal),
  );
});

it("forwards older copied links to Promo while preserving the creative and workspace", () => {
  window.history.replaceState(null, "", "/#creative=example&workspace=studio");
  render(<LegacyCreativeLinkRedirect />);
  expect(replace).toHaveBeenCalledWith(
    "/ad-campaigns?section=promo#creative=example&workspace=studio",
  );
});

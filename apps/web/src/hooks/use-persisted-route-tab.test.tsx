import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePersistedRouteTab } from "./use-persisted-route-tab";

const navigation = vi.hoisted(() => ({
  pathname: "/example",
  search: "",
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const tabs = ["first", "second"] as const;

function Fixture() {
  const [tab, setTab] = usePersistedRouteTab({
    param: "tab",
    storageKey: "example:last-tab",
    allowedValues: tabs,
    defaultValue: "first",
  });
  return <button onClick={() => setTab("second")}>{tab}</button>;
}

describe("usePersistedRouteTab", () => {
  beforeEach(() => {
    navigation.search = "";
    navigation.replace.mockReset();
    localStorage.clear();
  });

  it("restores the last valid tab when the route has no explicit tab", async () => {
    localStorage.setItem("example:last-tab", "second");
    render(<Fixture />);
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(
        "/example?tab=second",
        { scroll: false },
      ),
    );
  });

  it("persists explicit and user-selected tabs", () => {
    navigation.search = "tab=first&filter=active";
    render(<Fixture />);
    expect(localStorage.getItem("example:last-tab")).toBe("first");
    fireEvent.click(screen.getByRole("button", { name: "first" }));
    expect(localStorage.getItem("example:last-tab")).toBe("second");
    expect(navigation.replace).toHaveBeenLastCalledWith(
      "/example?tab=second&filter=active",
      { scroll: false },
    );
  });
});

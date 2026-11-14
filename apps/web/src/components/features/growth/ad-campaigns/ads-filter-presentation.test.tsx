import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdsFilterButton, AdsFilterSurface } from "./ads-filter-presentation";

vi.mock("@/providers/i18n-provider", () => ({
  useI18n: () => ({ t: (key: string) => ({ "ads.filters": "Фильтры", "ads.hide_filters": "Скрыть фильтры", "common.close": "Закрыть" } as Record<string, string>)[key] ?? key }),
  useOptionalI18n: () => null,
}));

function Harness({ mobile }: { mobile: boolean }) {
  const [open, setOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [search, setSearch] = useState("");
  const presentation = { isMobile: mobile, open, setOpen };
  return <>
    <AdsFilterButton presentation={presentation} desktopOpen={desktopOpen} toggleDesktop={() => setDesktopOpen(!desktopOpen)} />
    <AdsFilterSurface presentation={presentation} desktopOpen={desktopOpen}>
      <input aria-label="Поиск" value={search} onChange={(event) => setSearch(event.target.value)} />
    </AdsFilterSurface>
  </>;
}

describe("ads filter presentation", () => {
  it.each(["campaigns", "hypotheses", "promo"])("opens a full-width mobile modal for %s and keeps the chosen filters", () => {
    render(<Harness mobile />);
    const button = screen.getByRole("button", { name: "Фильтры" });
    expect(button).toHaveClass("w-full");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(button);
    const dialog = screen.getByRole("dialog", { name: "Фильтры" });
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "канал" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Закрыть" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.getByRole("textbox")).toHaveValue("канал");
  });

  it("keeps desktop filters inline", () => {
    render(<Harness mobile={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Фильтры" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Скрыть фильтры" })).toHaveAttribute("aria-expanded", "true");
  });
});

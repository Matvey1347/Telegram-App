import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PromoCard } from "./promo-card";

const promo = {
  id: "promo-1",
  telegramChannelId: "channel-1",
  title: "Крео 1",
  previewText:
    "Начало рекламного текста, которое должно быть видно в карточке.",
  previewImageUrl: "https://cdn.test/promo.jpg",
  status: "active",
} as const;

describe("PromoCard", () => {
  it("shows the creative opening and keeps edit and delete in the overflow menu", async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const { container } = render(
      <PromoCard promo={promo} onEdit={onEdit} onDelete={onDelete} />,
    );

    expect(screen.getByText(/Начало рекламного текста/)).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://cdn.test/promo.jpg",
    );
    expect(container.querySelector("img")).toHaveClass("h-auto", "w-full");
    expect(container.querySelector("img")).not.toHaveClass("object-cover");
    expect(container.querySelector("img")?.parentElement).not.toHaveClass(
      "aspect-[16/9]",
    );
    expect(
      screen.queryByRole("button", { name: "Edit" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Крео 1" }),
    );
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await userEvent.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Крео 1" }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledOnce();

    await userEvent.click(
      screen.getByRole("button", { name: "Edit promo Крео 1" }),
    );
    expect(onEdit).toHaveBeenCalledTimes(2);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("renders Telegram bold markup without visible delimiters", () => {
    render(
      <PromoCard
        promo={{ ...promo, previewText: "**Bold opening**" }}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText("Bold opening").tagName).toBe("B");
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });
});

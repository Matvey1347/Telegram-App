import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/providers/i18n-provider";
import { Pagination } from "./pagination";

vi.mock("next/navigation", () => ({
  usePathname: () => "/telegram-posts/channel/groups",
}));

const props = {
  page: 2,
  pageSize: 10,
  totalItems: 95,
  totalPages: 10,
  hasNextPage: true,
  hasPreviousPage: true,
  onPageChange: vi.fn(),
  onPageSizeChange: vi.fn(),
};

describe("Pagination", () => {
  it("exposes navigation state and controls", () => {
    render(<Pagination {...props} />);
    expect(
      screen.getByRole("navigation", { name: "Pagination" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Go to page 2" }),
    ).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(props.onPageChange).toHaveBeenCalledWith(3);
    expect(screen.getByText("Page 2 of 10")).toBeInTheDocument();
  });

  it("does not render for a single page", () => {
    const { container } = render(
      <Pagination
        {...props}
        page={1}
        totalItems={8}
        totalPages={1}
        hasNextPage={false}
        hasPreviousPage={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("localizes all pagination controls in Russian", () => {
    render(
      <I18nProvider initialLocale="ru">
        <Pagination {...props} />
      </I18nProvider>,
    );

    expect(
      screen.getByRole("navigation", { name: "Пагинация" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Перейти на страницу 2" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("button", { name: "Следующая страница" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Страница 2 из 10")).toBeInTheDocument();
    expect(screen.getByText("Показано с 11 по 20 из 95")).toBeInTheDocument();
    expect(screen.getByText("Строк на странице")).toBeInTheDocument();
  });
});

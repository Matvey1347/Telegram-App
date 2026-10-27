import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { FinanceLegalPage } from "./finance-legal-page";

beforeEach(() => window.localStorage.clear());

describe("FinanceLegalPage", () => {
  it("provides the policy in the selected language and preserves theme preference", async () => {
    render(<FinanceLegalPage kind="privacy" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Політика конфіденційності");
    await waitFor(() => expect(window.localStorage.getItem("groshly-language")).toBe("uk"));
    fireEvent.click(screen.getByRole("button", { name: /English/ }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Privacy Policy");
    fireEvent.click(screen.getByRole("button", { name: "Dark theme" }));
    await waitFor(() => expect(window.localStorage.getItem("groshly-language")).toBe("en"));
    expect(window.localStorage.getItem("groshly-theme")).toBe("dark");
    expect(screen.getByRole("link", { name: "matveybogdantg@gmail.com" })).toHaveAttribute(
      "href",
      "mailto:matveybogdantg@gmail.com",
    );
  });

  it("shows the terms of the actual finance service", () => {
    render(<FinanceLegalPage kind="terms" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Умови використання");
    expect(screen.getByRole("heading", { name: "Сервіс" })).toBeInTheDocument();
    expect(screen.getByText(/Groshly ·/)).toBeInTheDocument();
  });
});

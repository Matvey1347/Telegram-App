import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/test/render-with-i18n";
import { CrossPromotionPlanModal } from "./cross-promotion-plan-modal";

vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast: vi.fn() }),
}));

it("numbers the mutual-promotion sections and keeps creation actions in the dialog footer", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CrossPromotionPlanModal
        open
        kind="DIRECT_MUTUAL"
        initial={null}
        channels={[]}
        networks={[]}
        loading={false}
        saving={false}
        onBack={vi.fn()}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onSaveDraft={vi.fn()}
      />
    </QueryClientProvider>,
  );

  expect(await screen.findByRole("heading", { name: "Promotion details" })).toHaveTextContent("1");
  expect(screen.getByRole("button", { name: /My side/ })).toHaveTextContent("2");
  expect(screen.getByRole("button", { name: /Partner side/ })).toHaveTextContent("3");
  const save = screen.getByRole("button", { name: "Save draft" });
  const schedule = screen.getByRole("button", { name: "Create" });
  expect(save.querySelector("svg")).toBeInTheDocument();
  expect(schedule.querySelector("svg")).toBeInTheDocument();
  expect(save.closest("footer")).toContainElement(schedule);
  expect(save.parentElement).toBe(schedule.parentElement);
});

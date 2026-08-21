import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FinanceConfirmModal } from "./finance-confirm-modal";

describe("FinanceConfirmModal", () => {
  it("prevents duplicate submission and keeps a localized mutation error in the modal", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("failed"));
    render(
      <FinanceConfirmModal
        open
        locale="uk"
        entityName="Рахунок"
        actionLabel="Архівувати"
        description="Опис"
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText("Рахунок"), {
      target: { value: "Рахунок" },
    });
    const submit = screen.getByRole("button", { name: "Архівувати" });
    fireEvent.click(submit);
    expect(
      screen.getByRole("button", { name: "Підтверджуємо…" }),
    ).toBeDisabled();
    await waitFor(() =>
      expect(
        screen.getByText("Не вдалося виконати дію. Спробуйте ще раз."),
      ).toBeInTheDocument(),
    );
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

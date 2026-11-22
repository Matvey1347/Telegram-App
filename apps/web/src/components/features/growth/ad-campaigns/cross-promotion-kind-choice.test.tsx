import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { CrossPromotionKindChoice } from "./cross-promotion-create-steps";

it.each([
  ["Mutual promotion", "DIRECT_MUTUAL"],
  ["My channels", "OWN_CHANNELS"],
  ["Folder", "FOLDER"],
])("opens the workflow for %s", async (label, kind) => {
  const onSelect = vi.fn();
  render(<CrossPromotionKindChoice onSelect={onSelect} />);

  await userEvent.click(screen.getByRole("button", { name: label }));
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(kind);
});

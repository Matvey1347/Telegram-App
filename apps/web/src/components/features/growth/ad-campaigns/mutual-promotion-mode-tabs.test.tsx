import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MutualPromotionModeTabs } from "./cross-promotion-plans-page";
import { CrossPromotionKindChoice } from "./cross-promotion-create-steps";
import userEvent from "@testing-library/user-event";

describe("MutualPromotionModeTabs", () => {
  it("keeps both promotion kinds in one section and links to folders", () => {
    render(<MutualPromotionModeTabs mode="direct" />);
    expect(screen.queryByRole("link", { name: /Mutual promotion/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Promote my channels/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Folders" })).toBeInTheDocument();
  });

  it("lets a new promotion switch between mutual promotion and own channels", async () => {
    const onChange = vi.fn();
    render(<CrossPromotionKindChoice kind="DIRECT_MUTUAL" onChange={onChange} />);

    await userEvent.click(screen.getByRole("radio", { name: /Promote my channels/ }));
    expect(onChange).toHaveBeenCalledWith("OWN_CHANNELS");
  });
});

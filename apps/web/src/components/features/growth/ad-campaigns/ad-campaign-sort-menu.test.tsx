import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdCampaignSortMenu } from "./ad-campaign-sort-menu";

describe("AdCampaignSortMenu", () => {
  it("selects a field and preserves direction, then toggles direction", async () => {
    const onChange = vi.fn();
    render(<AdCampaignSortMenu value="date_desc" onChange={onChange} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Sort campaigns by" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Joined" }));
    await userEvent.click(
      screen.getByRole("button", { name: /Change to Ascending/i }),
    );

    expect(onChange).toHaveBeenCalledWith("joined_desc");
    expect(onChange).toHaveBeenCalledWith("date_asc");
  });
});

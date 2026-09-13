import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdCampaignSortMenu } from "./ad-campaign-sort-menu";

describe("AdCampaignSortMenu", () => {
  it("shows the active sort and selects another option", async () => {
    const onChange = vi.fn();
    render(<AdCampaignSortMenu value="date_desc" onChange={onChange} />);

    const trigger = screen.getByRole("button", { name: "Sort campaigns" });
    expect(trigger).toHaveTextContent("Newest");
    await userEvent.click(trigger);
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Most joined" }),
    );

    expect(onChange).toHaveBeenCalledWith("joined_desc");
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

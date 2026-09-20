import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CampaignMultiValueSelect } from "./campaign-multi-value-select";

describe("CampaignMultiValueSelect", () => {
  it("offers verification for a typed invite link and closes after success", async () => {
    const onCreateOption = vi.fn().mockResolvedValue(undefined);
    render(
      <CampaignMultiValueSelect
        value={[]}
        onChange={vi.fn()}
        options={[]}
        placeholder="Select invite links"
        canCreateOption={(input) => input.startsWith("https://t.me/+")}
        onCreateOption={onCreateOption}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Select invite links" }),
    );
    await userEvent.type(
      screen.getByPlaceholderText("Search..."),
      "https://t.me/+Verified_1",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Verify and add this invite link" }),
    );
    expect(onCreateOption).toHaveBeenCalledWith("https://t.me/+Verified_1");
    expect(screen.queryByPlaceholderText("Search...")).not.toBeInTheDocument();
  });
});

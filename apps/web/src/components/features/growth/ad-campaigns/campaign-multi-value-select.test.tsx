import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CampaignMultiValueSelect } from "./campaign-multi-value-select";

describe("CampaignMultiValueSelect", () => {
  it("opens its options without updating a parent during render", async () => {
    function Parent() {
      const [requested, setRequested] = useState(false);
      return (
        <>
          <CampaignMultiValueSelect
            value={[]}
            onChange={vi.fn()}
            options={[]}
            placeholder="Select invite links"
            onOpen={() => setRequested(true)}
          />
          {requested ? <span>Options requested</span> : null}
        </>
      );
    }

    render(<Parent />);
    await userEvent.click(
      screen.getByRole("button", { name: "Select invite links" }),
    );

    expect(screen.getByText("Options requested")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

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

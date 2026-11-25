import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { BotAdCampaignDialog } from "./bot-ad-campaign-dialog";

const seed = {};

afterEach(() => localStorage.clear());

it("labels test channels and restores an unfinished campaign from the standard picker", async () => {
  const user = userEvent.setup();
  const onSave = vi.fn().mockResolvedValue(undefined);
  const show = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <BotAdCampaignDialog
          seed={seed}
          promos={[{ id: "promo", title: "Promo" }]}
          channels={[
            {
              id: "test",
              title: "Editorial sandbox",
              isTest: true,
              avatarPresentation: null,
            },
          ]}
          pending={false}
          loading={false}
          failed={false}
          workspaceId="workspace"
          botScope="bot:LOCAL"
          onClose={vi.fn()}
          onSave={onSave}
        />
      </QueryClientProvider>,
    );

  const first = show();
  const name = screen.getByRole("textbox", { name: "Campaign name" });
  await user.type(name, "November campaign");
  const target = screen.getByRole("button", { name: "Publishing channels" });
  await user.click(target);
  const option = await screen.findByRole("button", {
    name: /Editorial sandbox/,
  });
  expect(within(option).getByText("Test")).toBeVisible();
  await user.click(option);
  await user.click(target);
  await user.click(screen.getByRole("button", { name: "Save as draft" }));
  expect(screen.getByText("November campaign")).toBeVisible();
  first.unmount();

  show();
  await user.click(
    screen.getByRole("button", { name: "Continue draft November campaign" }),
  );
  expect(screen.getByRole("textbox", { name: "Campaign name" })).toHaveValue(
    "November campaign",
  );
  expect(
    screen.getByRole("button", { name: "Publishing channels" }),
  ).toHaveTextContent("Editorial sandbox");
  expect(onSave).not.toHaveBeenCalled();
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AdCampaign } from "@/lib/api";
import { renderWithI18n as render } from "@/test/render-with-i18n";
import { CampaignInviteLinkHistoryModal } from "./campaign-invite-link-history-modal";

describe("CampaignInviteLinkHistoryModal", () => {
  it("includes pending requests in the current and peak invite-link counts", () => {
    const summary = {
      currentJoinedCount: 0,
      currentRequestedCount: 4,
      currentTotalAttributed: 4,
      peakJoinedCount: 0,
      peakRequestedCount: 7,
      peakTotalAttributed: 7,
      drawdownFromPeak: 3,
      drawdownPercent: 42.9,
      hasHighDropoff: true,
    };
    const campaign = {
      id: "campaign-1",
      title: "Pending-only campaign",
      telegramChannelId: "channel-1",
      inviteLinkHistory: {
        campaign: { id: "campaign-1", title: "Pending-only campaign" },
        inviteLinks: [
          {
            id: "link-1",
            name: "Pending link",
            url: "https://t.me/+test",
            joinedCount: 0,
            requestedCount: 4,
            isRevoked: false,
            summary,
          },
        ],
        points: [],
        summary: { ...summary, inviteLinksCount: 1 },
      },
    } as unknown as AdCampaign;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CampaignInviteLinkHistoryModal campaign={campaign} onClose={() => {}} />
      </QueryClientProvider>,
    );

    expect(screen.getByText(/current 4\s*\/\s*peak 7/i)).toBeInTheDocument();
    expect(screen.queryByText(/current 0\s*\/\s*peak 0/i)).toBeNull();
  });
});

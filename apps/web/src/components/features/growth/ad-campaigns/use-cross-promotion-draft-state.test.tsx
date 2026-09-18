import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CrossPromotionPlanKind } from "@telegram-system/shared";
import {
  emptyCrossPromotionPost,
  type CrossPromotionModalDraft,
} from "./cross-promotion-plan-draft";
import { useCrossPromotionDraftState } from "./use-cross-promotion-draft-state";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      me: vi.fn().mockResolvedValue({
        workspace: { timezone: "Europe/Warsaw" },
      }),
    },
  };
});

function storedDraft(kind: CrossPromotionPlanKind): CrossPromotionModalDraft {
  return {
    iconId: null,
    title: `${kind} restored`,
    publisherMode: "channels",
    publisherNetworkId: "",
    publisherIds: kind === "DIRECT_MUTUAL" ? ["publisher-1"] : [],
    partnerIds: [],
    partnerAdvertiserId: null,
    partnerContact: "",
    partnerTelegram: "",
    targets:
      kind === "OWN_CHANNELS"
        ? [
            {
              telegramChannelId: "target-1",
              promoId: "promo-1",
              inviteLinkId: "invite-1",
            },
          ]
        : [],
    post: { ...emptyCrossPromotionPost(), text: "Inbound post" },
    date: "2026-09-20",
    partnerDate: "2026-09-21",
    time: "10:00",
    publisherSettings: { formatIds: {}, times: {} },
    partnerSettings: { formatIds: {}, times: {} },
    outboundMode: "CUSTOM",
    outboundPost: {
      ...emptyCrossPromotionPost(),
      text: kind === "DIRECT_MUTUAL" ? "Outbound partner post" : "",
    },
    importedChannels: [],
  };
}

function store(kind: CrossPromotionPlanKind) {
  localStorage.setItem(
    `ads:cross-promotion:${kind}:draft:default`,
    JSON.stringify({
      version: 3,
      drafts: [
        {
          id: `${kind}-draft`,
          createdAt: "2026-09-15T10:00:00.000Z",
          updatedAt: "2026-09-15T11:00:00.000Z",
          schemaVersion: 1,
          form: storedDraft(kind),
        },
      ],
    }),
  );
}

function wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

describe("useCrossPromotionDraftState", () => {
  beforeEach(() => localStorage.clear());

  it.each(["DIRECT_MUTUAL", "OWN_CHANNELS"] as const)(
    "restores a %s draft through the shared session",
    async (kind) => {
      store(kind);
      const state = renderHook(
        () => useCrossPromotionDraftState({ open: true, initial: null, kind }),
        { wrapper },
      );
      await waitFor(() =>
        expect(state.result.current.drafts.pendingDrafts).toHaveLength(1),
      );

      act(() =>
        state.result.current.drafts.continueDraft(
          state.result.current.drafts.pendingDrafts[0],
        ),
      );
      expect(state.result.current.title).toBe(`${kind} restored`);
      if (kind === "DIRECT_MUTUAL") {
        expect(state.result.current.outboundPost.text).toBe(
          "Outbound partner post",
        );
      } else {
        expect(state.result.current.targets).toEqual([
          expect.objectContaining({ telegramChannelId: "target-1" }),
        ]);
      }
    },
  );
});

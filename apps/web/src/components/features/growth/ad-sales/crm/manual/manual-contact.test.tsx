import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { CrmManualInstagramWorkflow } from "@telegram-system/shared";
import {
  crmManualApi,
  crmManualKeys,
} from "@/lib/features/growth/crm-manual-api";
import { ManualContactPanel } from "./manual-contact-panel";
import { ManualOfferReport } from "./manual-offer-report";
import { candidateDraftFixture } from "../leads/qualification-fixtures.test-support";
import { ManualContacts } from "./manual-contacts";
import { safeContactUrl, safeInstagramProfile } from "./safe-contact-url";
import { authApi, telegramAdSalesApi } from "@/lib/api";
import { CrmContactChannels } from "../crm-contact-channels";
const method = {
  id: "ig1",
  value: "@Course.Studio",
  username: "course.studio",
  profileUrl: "https://www.instagram.com/course.studio/",
  state: "ACTIVE" as const,
  isPrimary: true,
  ownershipConfirmed: true,
  ownershipConfirmedAt: "2026-11-01T00:00:00Z",
  profileVerification: "UNVERIFIED" as const,
};
function fixture(
  patch: Partial<CrmManualInstagramWorkflow> = {},
): CrmManualInstagramWorkflow {
  return {
    contactId: "c1",
    channel: "INSTAGRAM",
    canEdit: true,
    methods: [method],
    manualStatus: null,
    attentionStatus: null,
    lastContactedAt: null,
    lastRepliedAt: null,
    nextFollowUp: null,
    nextContactAt: null,
    commercialOutreachAllowed: true,
    outreachBlockedReason: null,
    activities: [],
    nextCursor: null,
    hasMore: false,
    ...patch,
  };
}
function mount(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    ...render(
      <QueryClientProvider client={client}>{node}</QueryClientProvider>,
    ),
    client,
  };
}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(crmManualApi, "workflow").mockResolvedValue(fixture());
  vi.spyOn(crmManualApi, "activity").mockResolvedValue(
    fixture({
      attentionStatus: "WAITING_FOR_CLIENT",
      lastContactedAt: "2026-11-01T12:00:00Z",
    }),
  );
  vi.spyOn(authApi, "me").mockResolvedValue({
    workspace: { id: "w1", access: { isOwner: false, permissionKeys: [] } },
  } as unknown as Awaited<ReturnType<typeof authApi.me>>);
});
describe("manual Instagram workflow", () => {
  it("opens canonical profile and writes nothing on mount, without messages or receipts", async () => {
    mount(<ManualContactPanel workspace="w1" contactId="c1" compact />);
    expect(
      await screen.findByRole("link", { name: "Open Instagram" }),
    ).toHaveAttribute("href", method.profileUrl);
    expect(
      screen.getByText(/Profile existence unverified/),
    ).toBeInTheDocument();
    expect(crmManualApi.activity).not.toHaveBeenCalled();
    expect(screen.queryByText("✓✓")).not.toBeInTheDocument();
  });
  it("keeps the operation ID across HTTP failure/retry and reconciles server facts", async () => {
    vi.mocked(crmManualApi.activity).mockRejectedValueOnce(
      new Error("network"),
    );
    const { client } = mount(
      <ManualContactPanel workspace="w1" contactId="c1" compact />,
    );
    await screen.findByRole("button", { name: "Mark contacted" });
    fireEvent.change(screen.getByLabelText("Short manual note"), {
      target: { value: "Reached out about approved material" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark contacted" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Mark contacted" }));
    await waitFor(() => expect(crmManualApi.activity).toHaveBeenCalledTimes(2));
    const first = vi.mocked(crmManualApi.activity).mock.calls[0][1];
    expect(first.operationId).toMatch(/^\d{4}-\d{2}-\d{2}:[0-9a-f-]{36}$/);
    expect(vi.mocked(crmManualApi.activity).mock.calls[1][1]).toEqual(first);
    await waitFor(() =>
      expect(
        client.getQueryData(crmManualKeys.workflow("w1", "c1")),
      ).toMatchObject({ attentionStatus: "WAITING_FOR_CLIENT" }),
    );
  });
  it("supports follow-up with a client and no Telegram peer", async () => {
    vi.spyOn(crmManualApi, "schedule").mockResolvedValue(fixture());
    mount(<ManualContactPanel workspace="w1" contactId="c1" compact />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Needs follow-up" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(crmManualApi.schedule).toHaveBeenCalledWith(
        "c1",
        expect.objectContaining({
          at: expect.any(String),
          operationId: expect.any(String),
        }),
      ),
    );
  });
  it("honors authoritative view-only and DNC states", async () => {
    vi.mocked(crmManualApi.workflow).mockResolvedValue(
      fixture({
        canEdit: false,
        commercialOutreachAllowed: false,
        outreachBlockedReason: "DO_NOT_CONTACT",
      }),
    );
    mount(<ManualContactPanel workspace="w1" contactId="c1" compact />);
    await screen.findByText(/View only/);
    expect(
      screen.queryByRole("button", { name: "Mark contacted" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Short manual note"),
    ).not.toBeInTheDocument();
  });
  it("blocks commercial reports and stale profile opening, while allowing a reported reply under DNC", async () => {
    vi.mocked(crmManualApi.workflow).mockResolvedValue(
      fixture({
        methods: [{ ...method, state: "STALE" }],
        commercialOutreachAllowed: false,
        outreachBlockedReason: "DO_NOT_CONTACT",
      }),
    );
    mount(<ManualContactPanel workspace="w1" contactId="c1" compact />);
    expect(
      await screen.findByRole("button", { name: "Mark contacted" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Needs follow-up" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mark replied" })).toBeEnabled();
    expect(
      screen.queryByRole("link", { name: "Open Instagram" }),
    ).not.toBeInTheDocument();
  });
  it("records an approved candidate offer as manual fact without changing draft or sending", async () => {
    mount(
      <ManualOfferReport
        workspace="w1"
        contactId="c1"
        candidateId="candidate1"
        draft={{ ...candidateDraftFixture(), canCopy: true }}
      />,
    );
    const button = await screen.findByRole("button", {
      name: "I sent this approved offer manually",
    });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await screen.findByText("Manual offer report saved.");
    expect(crmManualApi.activity).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({
        action: "OFFER_SENT",
        candidateId: "candidate1",
        draftId: candidateDraftFixture().id,
        draftRevision: candidateDraftFixture().revision,
      }),
    );
    expect(
      screen.getByText(/does not confirm Instagram delivery/),
    ).toBeInTheDocument();
  });
  it("does not let a stale or unapproved candidate draft report commercial outreach", async () => {
    mount(
      <ManualOfferReport
        workspace="w1"
        contactId="c1"
        candidateId="candidate1"
        draft={{ ...candidateDraftFixture(), canCopy: false, status: "STALE" }}
      />,
    );
    expect(
      await screen.findByRole("button", {
        name: "I sent this approved offer manually",
      }),
    ).toBeDisabled();
    expect(crmManualApi.activity).not.toHaveBeenCalled();
  });
  it("keeps workspace query identities distinct", () => {
    expect(crmManualKeys.workflow("w1", "same")).not.toEqual(
      crmManualKeys.workflow("w2", "same"),
    );
    expect(crmManualKeys.list("w1", {})).not.toEqual(
      crmManualKeys.list("w2", {}),
    );
  });
  it("requires explicit contact list search, avoiding per-keypress reads", async () => {
    vi.spyOn(crmManualApi, "list").mockResolvedValue({
      items: [],
      hasMore: false,
      nextCursor: null,
    });
    mount(<ManualContacts workspace="w1" canCreate={false} />);
    await screen.findByText(/No Instagram contacts found/);
    fireEvent.change(screen.getByLabelText("Search manual contacts"), {
      target: { value: "course" },
    });
    expect(crmManualApi.list).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(crmManualApi.list).toHaveBeenCalledTimes(2));
  });
});
describe("contact link security and idle regression", () => {
  it.each([
    "javascript:alert(1)",
    "data:text/html,<h1>bad</h1>",
    "https://attacker.test/course",
    "http://instagram.com/course",
    "https://instagram.com/direct/inbox",
  ])("rejects unsafe Instagram value %s", (value) => {
    expect(safeInstagramProfile({ value, state: "ACTIVE" })).toBeUndefined();
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,bad",
    "https://name:password@safe.test",
  ])("rejects unsafe other URL %s", (value) => {
    expect(safeContactUrl("OTHER", value)).toBeUndefined();
  });
  it("does not auto-add detected Telegram for a viewer and makes legacy Instagram visibly unverified", async () => {
    vi.spyOn(telegramAdSalesApi, "getAdvertiser").mockResolvedValue({
      contacts: [
        {
          id: "old",
          type: "OTHER",
          label: "Instagram",
          value: "javascript:alert(1)",
          isPrimary: true,
        },
      ],
    } as Awaited<ReturnType<typeof telegramAdSalesApi.getAdvertiser>>);
    vi.spyOn(telegramAdSalesApi, "addAdvertiserContact");
    mount(
      <CrmContactChannels
        contactId="c1"
        canEdit={false}
        telegramUsername="detected_name"
      />,
    );
    await screen.findByText(/Legacy Instagram/);
    expect(telegramAdSalesApi.addAdvertiserContact).not.toHaveBeenCalled();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Add detected Telegram explicitly"),
    ).not.toBeInTheDocument();
  });
});

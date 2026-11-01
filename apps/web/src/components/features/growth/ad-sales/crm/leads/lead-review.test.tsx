import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { leadPreparationApi } from "@/lib/features/growth/lead-preparation-api";
import { preparationFixture } from "./qualification-fixtures.test-support";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { LeadCandidates } from "./lead-candidates";
import { LeadCandidateDetails } from "./lead-candidate-details";
import { candidateFixture } from "./lead-fixtures.test-support";
function mount(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(leadPreparationApi, "get").mockResolvedValue(preparationFixture());
  vi.spyOn(leadPreparationApi, "queue").mockResolvedValue({
    items: [candidateFixture()],
    hasMore: false,
    nextCursor: null,
  });
  vi.spyOn(leadDiscoveryApi, "candidates").mockResolvedValue({
    items: [candidateFixture()],
    hasMore: false,
    nextCursor: null,
  });
  vi.spyOn(leadDiscoveryApi, "candidate").mockResolvedValue(candidateFixture());
  vi.spyOn(leadDiscoveryApi, "reviewCandidate").mockImplementation(
    async (_id, body) => ({
      ...candidateFixture(),
      revision: body.revision + 1,
      reviewStatus: body.action === "REJECT" ? "REJECTED" : "APPROVED",
      riskStatus: body.riskStatus ?? "NEEDS_REVIEW",
      contacts: candidateFixture().contacts.map((v, i) => ({
        ...v,
        confirmed: body.confirmedContactIndexes?.includes(i),
      })),
      contactId:
        body.action === "CREATE_CLIENT"
          ? "existing-crm-client"
          : (body.contactId ?? null),
    }),
  );
  vi.spyOn(leadDiscoveryApi, "reviewCandidates").mockResolvedValue({
    items: [],
  });
  vi.spyOn(telegramCrmApi, "listContacts").mockResolvedValue({
    items: [
      {
        id: "crm-choice",
        displayName: "Existing advertiser",
        telegramUsername: "business_contact",
      },
    ],
    pagination: {
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  } as never);
});
describe("candidate human review and CRM boundaries", () => {
  it("does not fetch detailed evidence or create/link clients on queue open", async () => {
    mount(<LeadCandidates workspace="workspace-one" canReview />);
    await screen.findByRole("button", { name: "Advertiser project 1" });
    expect(leadDiscoveryApi.candidate).not.toHaveBeenCalled();
    expect(leadDiscoveryApi.reviewCandidate).not.toHaveBeenCalled();
    expect(telegramCrmApi.listContacts).not.toHaveBeenCalled();
  });
  it("loads candidate details only after an explicit open", async () => {
    mount(<LeadCandidates workspace="workspace-one" canReview />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Advertiser project 1" }),
    );
    await screen.findByText("Public business contacts");
    expect(leadDiscoveryApi.candidate).toHaveBeenCalledWith(
      "candidate-1",
      expect.any(AbortSignal),
    );
    expect(screen.getByText("All linked sources")).toBeTruthy();
    expect(screen.getByText("Review history")).toBeTruthy();
  });
  it("keeps read-only review controls hidden while preserving evidence", async () => {
    mount(
      <LeadCandidateDetails
        workspace="workspace-one"
        id="candidate-1"
        canReview={false}
        onClose={() => {}}
      />,
    );
    await screen.findByText("Public business contacts");
    expect(
      screen.queryByRole("button", { name: "Approve candidate" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Create CRM client" }),
    ).toBeNull();
    expect(screen.getByText("Public business offer 1")).toBeTruthy();
  });
  it("requires contact confirmation and acceptable human approval before CRM creation", async () => {
    mount(
      <LeadCandidateDetails
        workspace="workspace-one"
        id="candidate-1"
        canReview
        onClose={() => {}}
      />,
    );
    await screen.findByText("Human review & CRM");
    expect(
      screen.getByRole("button", { name: "Create CRM client" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /TELEGRAM · business_1 · SALES_CONTACT/,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Reviewed risk status" }),
    );
    fireEvent.click(screen.getByRole("option", { name: "ACCEPTABLE" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve candidate" }));
    await waitFor(() =>
      expect(leadDiscoveryApi.reviewCandidate).toHaveBeenCalledWith(
        "candidate-1",
        {
          revision: 1,
          action: "APPROVE",
          confirmedContactIndexes: [0],
          riskStatus: "ACCEPTABLE",
        },
      ),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Create CRM client" }),
      ).not.toBeDisabled(),
    );
    expect(leadDiscoveryApi.reviewCandidate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Create CRM client" }));
    await screen.findByRole("link", { name: "Open linked CRM client →" });
    expect(leadDiscoveryApi.reviewCandidate).toHaveBeenLastCalledWith(
      "candidate-1",
      expect.objectContaining({
        action: "CREATE_CLIENT",
        revision: 2,
        displayName: "Advertiser project 1",
      }),
    );
  });
  it("links through a bounded existing-client picker instead of a raw ID field", async () => {
    vi.mocked(leadDiscoveryApi.candidate).mockResolvedValue({
      ...candidateFixture(),
      reviewStatus: "APPROVED",
      riskStatus: "ACCEPTABLE",
      contacts: candidateFixture().contacts.map((v) => ({
        ...v,
        confirmed: true,
      })),
    });
    mount(
      <LeadCandidateDetails
        workspace="workspace-one"
        id="candidate-1"
        canReview
        onClose={() => {}}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Link existing CRM client" }),
    );
    await waitFor(() =>
      expect(telegramCrmApi.listContacts).toHaveBeenCalledWith(
        { page: 1, pageSize: 20, search: undefined, archived: false },
        expect.any(AbortSignal),
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Existing CRM client" }),
    );
    fireEvent.click(
      await screen.findByRole("option", {
        name: "Existing advertiser · @business_contact",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm client link" }),
    );
    await waitFor(() =>
      expect(leadDiscoveryApi.reviewCandidate).toHaveBeenCalledWith(
        "candidate-1",
        expect.objectContaining({ action: "LINK", contactId: "crm-choice" }),
      ),
    );
  });
  it("supports manual duplicate search even when no alias suggestions exist", async () => {
    vi.mocked(leadDiscoveryApi.candidates).mockResolvedValue({
      items: [
        candidateFixture(),
        candidateFixture(2),
        { ...candidateFixture(3), reviewStatus: "REJECTED" },
        { ...candidateFixture(4), reviewStatus: "MERGED" },
      ],
      hasMore: false,
      nextCursor: null,
    });
    mount(
      <LeadCandidateDetails
        workspace="workspace-one"
        id="candidate-1"
        canReview
        onClose={() => {}}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Review duplicate merge" }),
    );
    await waitFor(() =>
      expect(leadDiscoveryApi.candidates).toHaveBeenCalledWith(
        { search: undefined, limit: 10, cursor: undefined },
        expect.any(AbortSignal),
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Manual merge target" }),
    );
    expect(
      screen.queryByRole("option", { name: /Advertiser project 3/ }),
    ).toBeNull();
    fireEvent.click(
      await screen.findByRole("option", {
        name: "Advertiser project 2 · PENDING",
      }),
    );
    expect(
      screen.getByRole("button", { name: "Merge reviewed duplicate" }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "I verified these records represent the same advertiser",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Merge reviewed duplicate" }),
    );
    await waitFor(() =>
      expect(leadDiscoveryApi.reviewCandidate).toHaveBeenCalledWith(
        "candidate-1",
        expect.objectContaining({
          action: "MERGE",
          mergeIntoId: "candidate-2",
          revision: 1,
        }),
      ),
    );
  });
  it("limits bulk review to twenty explicit candidates", async () => {
    vi.mocked(leadPreparationApi.queue).mockResolvedValue({
      items: Array.from({ length: 21 }, (_, i) => candidateFixture(i + 1)),
      hasMore: false,
      nextCursor: null,
    });
    mount(<LeadCandidates workspace="workspace-one" canReview />);
    await screen.findByRole("button", { name: "Advertiser project 21" });
    for (let n = 1; n <= 21; n++)
      fireEvent.click(
        screen.getByRole("checkbox", {
          name: `Select candidate Advertiser project ${n}`,
        }),
      );
    expect(screen.getByRole("alert")).toHaveTextContent("no more than 20");
    fireEvent.click(
      screen.getByRole("button", { name: "Approve selected (20/20)" }),
    );
    expect(leadDiscoveryApi.reviewCandidates).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm selected review" }),
    );
    await waitFor(() =>
      expect(leadDiscoveryApi.reviewCandidates).toHaveBeenCalledWith(
        Array.from({ length: 20 }, (_, i) => `candidate-${i + 1}`),
        "APPROVE",
      ),
    );
  });
  it("keeps a recoverable stale-revision failure instead of pretending approval succeeded", async () => {
    vi.mocked(leadDiscoveryApi.reviewCandidate).mockRejectedValue(
      new Error("private-db-error"),
    );
    mount(
      <LeadCandidateDetails
        workspace="workspace-one"
        id="candidate-1"
        canReview
        onClose={() => {}}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Approve candidate" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("revision");
    expect(screen.queryByText("private-db-error")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Create CRM client" }),
    ).toBeDisabled();
  });
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { leadPreparationApi } from "@/lib/features/growth/lead-preparation-api";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import {
  leadKeys,
  patchLeadPreparation,
} from "@/lib/features/growth/lead-discovery-query";
import { candidateFixture } from "./lead-fixtures.test-support";
import {
  candidateDraftFixture,
  preparationFixture,
  qualificationFixture,
} from "./qualification-fixtures.test-support";
import { LeadCandidates } from "./lead-candidates";
import { LeadPreparation } from "./lead-preparation";
import { LeadContactPreparations } from "./lead-contact-preparations";
import { authApi } from "@/lib/api";
const candidate = () => ({
  ...candidateFixture(),
  reviewStatus: "APPROVED" as const,
  riskStatus: "ACCEPTABLE" as const,
  contacts: candidateFixture().contacts.map((v) => ({ ...v, confirmed: true })),
});
function mount(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>,
  );
  return { ...result, client };
}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(leadPreparationApi, "queue").mockResolvedValue({
    items: [candidate()],
    hasMore: false,
    nextCursor: null,
  });
  vi.spyOn(leadPreparationApi, "get").mockResolvedValue(preparationFixture());
  vi.spyOn(leadPreparationApi, "qualify").mockResolvedValue({
    ...preparationFixture(),
    workflowState: "NEEDS_REVIEW",
    qualification: qualificationFixture(),
  });
  vi.spyOn(leadPreparationApi, "generate").mockResolvedValue({
    ...preparationFixture(),
    drafts: [candidateDraftFixture()],
  });
  vi.spyOn(leadPreparationApi, "decide").mockResolvedValue({
    ...preparationFixture(),
    workflowState: "QUALIFIED",
    qualification: qualificationFixture(),
    qualificationDecision: "QUALIFIED",
    canGenerateDraft: true,
  });
  vi.spyOn(leadPreparationApi, "updateDraft").mockResolvedValue(
    preparationFixture(),
  );
  vi.spyOn(leadPreparationApi, "products").mockResolvedValue({
    asOf: "2026-11-01T00:00:00Z",
    discountPolicy: "MANAGER_APPROVAL_REQUIRED",
    networks: [],
    networksTruncated: false,
    products: [],
    nextCursor: null,
    hasMore: false,
  });
  vi.spyOn(leadDiscoveryApi, "candidate").mockResolvedValue(candidate());
});
describe("candidate qualification and approved preparation", () => {
  it("opens no details, catalog or AI on queue load; selected detail is lazy", async () => {
    mount(<LeadCandidates workspace="workspace-one" canReview />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Advertiser project 1" }),
    );
    await screen.findByRole("heading", { name: "Advertiser project 1" });
    expect(leadPreparationApi.get).not.toHaveBeenCalled();
    expect(leadPreparationApi.qualify).not.toHaveBeenCalled();
    expect(leadPreparationApi.generate).not.toHaveBeenCalled();
    expect(leadPreparationApi.products).not.toHaveBeenCalled();
  });
  it("requests a workflow filter on the server before pagination", async () => {
    mount(<LeadCandidates workspace="workspace-one" canReview />);
    fireEvent.click(screen.getByLabelText("Workflow"));
    fireEvent.click(screen.getByRole("option", { name: "NEW" }));
    await waitFor(() =>
      expect(leadPreparationApi.queue).toHaveBeenLastCalledWith(
        { limit: 50, workflow: "NEW", cursor: undefined },
        expect.any(AbortSignal),
      ),
    );
  });
  it("qualifies only after explicit action and keeps draft generation separate", async () => {
    mount(<LeadPreparation candidate={candidate()} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Qualify explicitly with AI" }),
    );
    await screen.findByText("Explicit educational offer");
    expect(leadPreparationApi.qualify).toHaveBeenCalledWith("candidate-1", {
      operationId: expect.any(String),
      productIds: [],
    });
    expect(leadPreparationApi.generate).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Generate first offer" }),
    ).toBeDisabled();
  });
  it("requires a separate acknowledged high risk decision and a meaningful note", async () => {
    const qualification = qualificationFixture();
    qualification.score = { ...qualification.score!, riskLevel: "RISK_HIGH" };
    vi.mocked(leadPreparationApi.get).mockResolvedValue({
      ...preparationFixture(),
      qualification,
    });
    mount(<LeadPreparation candidate={candidate()} />);
    const approve = await screen.findByRole("button", {
      name: "Confirm qualified",
    });
    expect(approve).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", { name: /I reviewed the high-risk/ }),
    );
    expect(approve).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Risk review note"), {
      target: { value: "Evidence reviewed by a manager." },
    });
    fireEvent.click(approve);
    await waitFor(() =>
      expect(leadPreparationApi.decide).toHaveBeenCalledWith(
        "candidate-1",
        expect.objectContaining({
          revision: 1,
          qualificationId: "qualification-1",
          contextVersion: "context-1",
          decision: "QUALIFIED",
          acknowledgeHighRisk: true,
          note: "Evidence reviewed by a manager.",
        }),
      ),
    );
  });
  it("requires a new high-risk acknowledgement for a replacement qualification with the same context", async () => {
    const q = qualificationFixture();
    q.score = { ...q.score!, riskLevel: "RISK_HIGH" };
    const view = { ...preparationFixture(), qualification: q };
    vi.mocked(leadPreparationApi.get)
      .mockResolvedValueOnce(view)
      .mockResolvedValue({
        ...view,
        qualification: { ...q, id: "replacement-result" },
      });
    mount(<LeadPreparation candidate={candidate()} />);
    const ack = await screen.findByRole("checkbox", {
      name: /I reviewed the high-risk/,
    });
    fireEvent.click(ack);
    fireEvent.change(screen.getByLabelText("Risk review note"), {
      target: { value: "Review of the previous result." },
    });
    expect(
      screen.getByRole("button", { name: "Confirm qualified" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Confirm qualified" }),
      ).toBeDisabled(),
    );
    expect(ack).not.toBeChecked();
    expect(screen.getByLabelText("Risk review note")).toHaveValue("");
  });
  it("shows insufficient evidence and unknown cost without a false precise score", async () => {
    const q = qualificationFixture();
    q.status = "UNKNOWN";
    q.score = {
      ...q.score!,
      status: "INSUFFICIENT_EVIDENCE",
      overall: null,
      relevance: null,
      evidenceQuality: null,
      priority: "INSUFFICIENT_EVIDENCE",
      riskLevel: "RISK_UNKNOWN",
    };
    vi.mocked(leadPreparationApi.get).mockResolvedValue({
      ...preparationFixture(),
      qualification: q,
    });
    mount(<LeadPreparation candidate={candidate()} />);
    await screen.findByText("Insufficient evidence");
    expect(screen.queryByText("82")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Confirm qualified" }),
    ).toBeNull();
  });
  it("does not persist typing and requires save before draft approval", async () => {
    const draft = candidateDraftFixture();
    vi.mocked(leadPreparationApi.get).mockResolvedValue({
      ...preparationFixture(),
      drafts: [draft],
    });
    mount(<LeadPreparation candidate={candidate()} />);
    const editor = await screen.findByLabelText("Prepared first message");
    fireEvent.change(editor, {
      target: { value: "Edited approved-facts proposal" },
    });
    expect(leadPreparationApi.updateDraft).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Approve first message" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(leadPreparationApi.updateDraft).toHaveBeenCalledWith(
        "candidate-1",
        "draft-1",
        { revision: 1, action: "SAVE", text: "Edited approved-facts proposal" },
      ),
    );
  });
  it("rechecks current source and approval before copying; stale copy is blocked", async () => {
    const draft = {
      ...candidateDraftFixture(),
      status: "APPROVED" as const,
      canCopy: true,
    };
    const view = { ...preparationFixture(), drafts: [draft] };
    vi.mocked(leadPreparationApi.get)
      .mockResolvedValueOnce(view)
      .mockResolvedValue({
        ...view,
        drafts: [{ ...draft, status: "STALE", canCopy: false }],
      });
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    mount(<LeadPreparation candidate={candidate()} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Copy approved message" }),
    );
    await screen.findByText(
      "Copy blocked. Reload current source, contact and approval state.",
    );
    expect(writeText).not.toHaveBeenCalled();
  });
  it("preserves Ukrainian default and explicit tone while producing no send capability", async () => {
    vi.mocked(leadPreparationApi.get).mockResolvedValue({
      ...preparationFixture(),
      workflowState: "QUALIFIED",
      canGenerateDraft: true,
      qualification: qualificationFixture(),
    });
    mount(<LeadPreparation candidate={candidate()} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Generate first offer" }),
    );
    await waitFor(() =>
      expect(leadPreparationApi.generate).toHaveBeenCalledWith(
        "candidate-1",
        expect.objectContaining({
          tone: "NATURAL",
          language: "uk",
          productIds: [],
        }),
      ),
    );
    expect(screen.queryByRole("button", { name: /^Send/ })).toBeNull();
  });
  it("keeps denied generation controls disabled and supports recoverable errors", async () => {
    vi.mocked(leadPreparationApi.get).mockResolvedValue({
      ...preparationFixture(),
      canQualify: false,
      canReview: false,
      blockedReason: "DNC",
    });
    mount(<LeadPreparation candidate={candidate()} />);
    expect(
      await screen.findByRole("button", { name: "Qualify explicitly with AI" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Generate first offer" }),
    ).toBeDisabled();
    expect(leadPreparationApi.qualify).not.toHaveBeenCalled();
  });
  it("disables cached preparation actions after a permission-changing reload failure", async () => {
    vi.mocked(leadPreparationApi.get)
      .mockResolvedValueOnce({
        ...preparationFixture(),
        canGenerateDraft: true,
      })
      .mockRejectedValue(new Error("forbidden"));
    mount(<LeadPreparation candidate={candidate()} />);
    const generate = await screen.findByRole("button", {
      name: "Generate first offer",
    });
    await waitFor(() => expect(generate).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    await screen.findByText(
      "Preparation unavailable. Check workspace permissions and retry.",
    );
    expect(generate).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Qualify explicitly with AI" }),
    ).toBeDisabled();
  });
  it("reconciles qualification summary and removes rows from incompatible cached filters", () => {
    const client = new QueryClient();
    const item = candidate();
    client.setQueryData(leadKeys.queue("workspace-one", { workflow: "NEW" }), {
      pages: [{ items: [item], hasMore: false, nextCursor: null }],
      pageParams: [undefined],
    });
    const otherKey = leadKeys.queue("workspace-two", {});
    client.setQueryData(otherKey, {
      pages: [{ items: [item], hasMore: false, nextCursor: null }],
      pageParams: [undefined],
    });
    patchLeadPreparation(client, "workspace-one", {
      ...preparationFixture(),
      workflowState: "QUALIFIED",
      qualification: qualificationFixture(),
    });
    expect(
      client.getQueryData(leadKeys.queue("workspace-one", { workflow: "NEW" })),
    ).toMatchObject({ pages: [{ items: [] }] });
    expect(client.getQueryData(otherKey)).toMatchObject({
      pages: [{ items: [item] }],
    });
  });
  it("loads linked CRM acquisition only after explicit open", async () => {
    vi.spyOn(authApi, "me").mockResolvedValue({
      workspace: {
        id: "workspace-one",
        access: { isOwner: true, permissionKeys: [] },
      },
    } as never);
    vi.spyOn(leadPreparationApi, "contact").mockResolvedValue({
      items: [{ ...candidate(), contactId: "crm-1" }],
      hasMore: false,
      nextCursor: null,
    });
    mount(<LeadContactPreparations contactId="crm-1" />);
    const open = await screen.findByRole("button", {
      name: "AI-discovered sources and prepared offers",
    });
    expect(leadPreparationApi.contact).not.toHaveBeenCalled();
    fireEvent.click(open);
    await screen.findByRole("button", { name: "Advertiser project 1" });
    expect(leadPreparationApi.contact).toHaveBeenCalledTimes(1);
  });
});

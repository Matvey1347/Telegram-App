import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  leadAccess,
  leadKeys,
  patchLeadEntity,
} from "@/lib/features/growth/lead-discovery-query";
import { leadExportBlob, leadSafeUrl } from "./lead-utils";
import { materialRows } from "./lead-material-import";
import { candidateFixture, sourceFixture } from "./lead-fixtures.test-support";
describe("Lead Discovery isolation, exports and input boundaries", () => {
  it("separates workspace cache identities and permission capabilities", () => {
    expect(leadKeys.candidates("one", {})).not.toEqual(
      leadKeys.candidates("two", {}),
    );
    expect(
      leadAccess({ isOwner: false, permissionKeys: ["adSales.leads.view"] }),
    ).toEqual({ view: true, manage: false, review: false, analyze: false });
    expect(leadAccess()).toEqual({
      view: false,
      manage: false,
      review: false,
      analyze: false,
    });
  });
  it("reconciles filtered candidate membership without overwriting another workspace", async () => {
    const client = new QueryClient();
    const c = candidateFixture();
    const first = leadKeys.candidates("workspace-one", {
      reviewStatus: "PENDING",
    });
    const other = leadKeys.candidates("workspace-two", {});
    const data = {
      pages: [{ items: [c], hasMore: false, nextCursor: null }],
      pageParams: [undefined],
    };
    client.setQueryData(first, data);
    client.setQueryData(other, data);
    await patchLeadEntity(client, leadKeys.candidatesRoot("workspace-one"), {
      ...c,
      reviewStatus: "APPROVED",
    });
    expect(client.getQueryData(first)).toMatchObject({
      pages: [{ items: [] }],
    });
    expect(client.getQueryData(other)).toEqual(data);
  });
  it("removes paused source rows from active-only views using the authoritative response", async () => {
    const client = new QueryClient();
    const s = sourceFixture();
    const key = leadKeys.sources(s.workspaceId, { status: "ACTIVE" });
    client.setQueryData(key, {
      pages: [{ items: [s], hasMore: false, nextCursor: null }],
      pageParams: [undefined],
    });
    await patchLeadEntity(client, leadKeys.sourcesRoot(s.workspaceId), {
      ...s,
      status: "PAUSED",
      monitoringState: "PAUSED",
    });
    expect(client.getQueryData(key)).toMatchObject({ pages: [{ items: [] }] });
  });
  it("accepts only browser-safe reference URLs without hidden credentials", () => {
    expect(leadSafeUrl("javascript:alert(1)")).toBeUndefined();
    expect(leadSafeUrl("https://user:secret@example.test")).toBeUndefined();
    expect(leadSafeUrl("https://t.me/business/123")).toBe(
      "https://t.me/business/123",
    );
  });
  it("keeps formula-escaped CSV as inert download bytes and validates MIME/base64", async () => {
    const csv = 'source\n\'=HYPERLINK("https://example.test")';
    const blob = leadExportBlob({
      fileName: "sources.csv",
      mimeType: "text/csv;charset=utf-8",
      contentBase64: btoa(csv),
      truncated: false,
    });
    expect(blob.size).toBe(csv.length);
    const value = await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsText(blob);
    });
    expect(value).toBe(csv);
    expect(() =>
      leadExportBlob({
        fileName: "bad.html",
        mimeType: "text/html",
        contentBase64: btoa("<script>"),
        truncated: false,
      }),
    ).toThrow();
    expect(() =>
      leadExportBlob({
        fileName: "bad.csv",
        mimeType: "text/csv",
        contentBase64: "not base64!",
        truncated: false,
      }),
    ).toThrow();
  });
  it("rejects oversized materials, invalid identities and rolled publication dates", () => {
    const valid = {
      externalMessageId: "import:123",
      text: "Permitted business material",
      date: "2026-10-31",
      time: "12:30",
      messageUrl: "",
    };
    expect(materialRows([valid])[0].publishedAt).toBe(
      "2026-10-31T12:30:00.000Z",
    );
    expect(() =>
      materialRows([{ ...valid, text: "x".repeat(4097) }]),
    ).toThrow();
    expect(() => materialRows([{ ...valid, date: "2026-02-31" }])).toThrow();
    expect(() =>
      materialRows([{ ...valid, externalMessageId: "private/id" }]),
    ).toThrow();
    expect(() =>
      materialRows(Array.from({ length: 21 }, () => valid)),
    ).toThrow();
  });
});

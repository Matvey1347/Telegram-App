import { describe, expect, it } from "vitest";
import { parseCrmEventStreamChunk } from "./telegram-crm-api";

describe("CRM SSE parser", () => {
  it("keeps partial frames and parses the completed event", () => {
    const first = parseCrmEventStreamChunk("", 'event: contact.updated\ndata: {"type":"contact.');
    expect(first.events).toEqual([]);
    const second = parseCrmEventStreamChunk(
      first.remainder,
      'updated","workspaceId":"w1","occurredAt":"now","contactId":"c1","ownerMemberId":null}\n\n',
    );
    expect(second.remainder).toBe("");
    expect(second.events).toEqual([
      expect.objectContaining({ type: "contact.updated", contactId: "c1" }),
    ]);
  });

  it("ignores malformed data without dropping later valid events", () => {
    const result = parseCrmEventStreamChunk("", 'data: nope\n\ndata: {"type":"inbox.updated","workspaceId":"w1","occurredAt":"now","peerId":"p1","contactId":null,"ownerMemberId":null,"conversation":null}\n\n');
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.type).toBe("inbox.updated");
  });
});

import { describe, expect, it } from "vitest";
import type { Account } from "@/lib/api";
import { groupAccountsByOwner } from "./account-groups";

const account = (id: string, memberId: string | null, name: string): Account =>
  ({
    id,
    name,
    assignedMember: memberId
      ? { id: memberId, user: { id: `user-${memberId}`, name } }
      : null,
  }) as Account;

describe("groupAccountsByOwner", () => {
  it("keeps accounts grouped by member, with an unassigned fallback", () => {
    const groups = groupAccountsByOwner([
      account("account-1", "member-1", "Matthew"),
      account("account-2", "member-2", "Bohdan"),
      account("account-3", "member-1", "Matthew"),
      account("account-4", null, ""),
    ]);

    expect(groups).toEqual([
      expect.objectContaining({
        key: "member-1",
        label: "Matthew",
        accounts: [expect.objectContaining({ id: "account-1" }), expect.objectContaining({ id: "account-3" })],
      }),
      expect.objectContaining({ key: "member-2", label: "Bohdan" }),
      expect.objectContaining({ key: "unassigned", label: "Unassigned" }),
    ]);
  });
});

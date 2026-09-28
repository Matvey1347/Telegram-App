import type { Account } from "@/lib/api";

export type AccountScope = "mine" | "all" | "archived";

export type AccountOwnerGroup = {
  key: string;
  label: string;
  member: Account["assignedMember"];
  accounts: Account[];
};

export function groupAccountsByOwner(accounts: Account[]): AccountOwnerGroup[] {
  const groups = new Map<string, AccountOwnerGroup>();
  for (const account of accounts) {
    const member = account.assignedMember;
    const key = member?.id ?? "unassigned";
    const group = groups.get(key) ?? {
      key,
      label: member?.user.name ?? "Unassigned",
      member,
      accounts: [],
    };
    group.accounts.push(account);
    groups.set(key, group);
  }
  return [...groups.values()];
}

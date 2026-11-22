export type CrmInstagramMethod = {
  id: string;
  value: string;
  username: string;
  profileUrl: string;
  state: "ACTIVE" | "STALE";
  isPrimary: boolean;
  ownershipConfirmed: boolean;
  ownershipConfirmedAt: string | null;
  profileVerification: "UNVERIFIED";
};
export type CrmInstagramMethodInput = {
  value: string;
  ownershipConfirmed: boolean;
  state?: "ACTIVE" | "STALE";
  isPrimary?: boolean;
};

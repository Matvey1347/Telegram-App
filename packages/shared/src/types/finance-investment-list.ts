export type FinanceInvestmentListItem = {
  id: string;
  amount: string;
  currency: string;
  date: string;
  notes: string | null;
  movementType: "CONTRIBUTION" | "WITHDRAWAL";
  workspaceMember: { user: { name: string } };
  account: { name: string } | null;
};

import type {
  ConsumerFinanceAccountSummary,
  ConsumerFinanceValuationSnapshot,
} from "./ledger";

export type ConsumerFinanceSavingsGoalStatus =
  | "ACTIVE"
  | "COMPLETED"
  | "ARCHIVED";

export type ConsumerFinanceSavingsMovementKind =
  | "ALLOCATE"
  | "RELEASE"
  | "REALLOCATE";

export type ConsumerFinanceSavingsGoal = {
  id: string;
  name: string;
  targetAmount: string;
  currency: string;
  targetDate?: string | null;
  note?: string | null;
  status: ConsumerFinanceSavingsGoalStatus;
  currentAllocated: string;
  linkedAllocated: string;
  legacyUnlinkedAmount: string;
  backedAmount: string;
  remainingAmount: string;
  progressPercentage: number;
  fundingStatus: "BACKED" | "UNDERFUNDED" | "UNLINKED_LEGACY";
  completedAt?: string | null;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConsumerFinanceSavingsGoalInput = {
  name: string;
  targetAmount: string;
  currency: string;
  targetDate?: string | null;
  note?: string | null;
};

export type ConsumerFinanceSavingsGoalPage = {
  items: ConsumerFinanceSavingsGoal[];
  nextCursor: string | null;
};

export type ConsumerFinanceSavingsMovement = {
  id: string;
  kind: ConsumerFinanceSavingsMovementKind;
  fromGoalId?: string | null;
  toGoalId?: string | null;
  accountId: string;
  account?: ConsumerFinanceAccountSummary;
  amount: string;
  currency: string;
  valuationSnapshot: ConsumerFinanceValuationSnapshot;
  occurredAt: string;
  note?: string | null;
  linkedTransferId?: string | null;
  createdAt: string;
};

export type ConsumerFinanceSavingsMovementPage = {
  items: ConsumerFinanceSavingsMovement[];
  nextCursor: string | null;
};

export type ConsumerFinanceSavingsAllocationInput = {
  accountId: string;
  amount: string;
  occurredAt: string;
  note?: string;
  linkedTransferId?: string;
  idempotencyKey: string;
};

export type ConsumerFinanceSavingsReallocationInput = {
  fromGoalId: string;
  toGoalId: string;
  accountId: string;
  amount: string;
  occurredAt: string;
  note?: string;
  idempotencyKey: string;
};

export type ConsumerFinanceSavingsMutation = {
  goals: ConsumerFinanceSavingsGoal[];
  movement?: ConsumerFinanceSavingsMovement | null;
  duplicate: boolean;
};

export type ConsumerFinanceSavingsSummary = {
  currency: string;
  allocated: string;
  backed: string;
  activeGoals: number;
  completedGoals: number;
  underfundedGoals: number;
  excludedGoals: Array<{
    goalId: string;
    name: string;
    amount: string;
    currency: string;
    reason: "RATE_UNAVAILABLE" | "UNLINKED_LEGACY";
  }>;
};

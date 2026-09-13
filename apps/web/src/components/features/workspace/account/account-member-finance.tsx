"use client";

import { useQuery } from "@tanstack/react-query";
import { Button, Card, Skeleton } from "@/components/ui/primitives";
import { memberFinanceApi } from "@/lib/api";
import { memberFinanceKeys } from "@/lib/query-keys";
import { WorkspaceMemberFinance } from "../workspace-member-finance";

export function AccountMemberFinance({
  memberId,
  name,
  canManage,
}: {
  memberId: string;
  name: string;
  canManage: boolean;
}) {
  const summaries = useQuery({
    queryKey: memberFinanceKeys.summaries(),
    queryFn: memberFinanceApi.summaries,
  });
  const summary = summaries.data?.find((row) => row.memberId === memberId);

  if (summaries.isLoading) {
    return <Skeleton className="mt-4 h-20 max-w-3xl" />;
  }
  if (summaries.isError) {
    return (
      <Card className="mt-4 flex max-w-3xl items-center justify-between gap-3 text-sm text-rose-300">
        <span>Could not load your earnings and investments.</span>
        <Button variant="secondary" onClick={() => summaries.refetch()}>
          Retry
        </Button>
      </Card>
    );
  }
  if (!summary) return null;

  return (
    <Card className="mt-4 max-w-3xl">
      <h3 className="font-semibold text-white">My earnings and investments</h3>
      <p className="mt-1 text-sm text-neutral-500">
        Open the card to see every commission, salary payment, investment and
        reinvestment movement.
      </p>
      <WorkspaceMemberFinance
        member={{ id: memberId, user: { name } }}
        summary={summary}
        canManage={canManage}
      />
    </Card>
  );
}

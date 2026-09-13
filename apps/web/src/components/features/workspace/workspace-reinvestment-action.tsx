"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Repeat2 } from "lucide-react";
import { memberFinanceApi } from "@/lib/api";
import {
  Button,
  DateRangeInput,
  FormField,
  Modal,
} from "@/components/ui/primitives";
import {
  dashboardKeys,
  memberFinanceKeys,
  workspaceKeys,
} from "@/lib/query-keys";

function monthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const local = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { from: local(from), to: local(now) };
}

export function WorkspaceReinvestmentAction() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState(monthRange);
  const mutation = useMutation({
    mutationFn: () =>
      memberFinanceApi.distributeReinvestment({
        dateFrom: range.from,
        dateTo: range.to,
      }),
    onSuccess: async () => {
      setOpen(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: memberFinanceKeys.summaries() }),
        qc.invalidateQueries({ queryKey: workspaceKeys.members() }),
        qc.invalidateQueries({ queryKey: dashboardKeys.summary() }),
      ]);
    },
  });
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Repeat2 size={15} /> Distribute reinvestment
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Distribute business profit"
      >
        <p className="text-sm text-neutral-400">
          Net profit for the period is allocated by each investor&apos;s current
          capital share. A period can be distributed only once.
        </p>
        <div className="mt-4">
          <FormField label="Profit period">
            <DateRangeInput
              from={range.from}
              to={range.to}
              onChange={({ from, to }) => setRange({ from, to })}
            />
          </FormField>
        </div>
        {mutation.error ? (
          <p className="mt-3 text-sm text-rose-300">
            {(mutation.error as { response?: { data?: { message?: string } } })
              .response?.data?.message ?? "Could not distribute profit"}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!range.from || !range.to || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Confirm distribution
          </Button>
        </div>
      </Modal>
    </>
  );
}

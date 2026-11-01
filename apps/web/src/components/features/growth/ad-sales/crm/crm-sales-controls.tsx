"use client";

import { useState } from "react";
import { BellRing, CircleHelp } from "lucide-react";
import { CRM_MANUAL_SALES_STATUSES, type CrmManualSalesStatus } from "@telegram-system/shared";
import { Button, CustomSelect, Modal } from "@/components/ui/primitives";
import { ActionMenu, ActionMenuItem } from "@/components/ui/action-menu";
import { useCrmSalesWorkflow } from "@/lib/features/growth/use-crm-sales-workflow";
import { formatDateTime } from "@/lib/date-format";
import { salesStatusLabel, useCrmSalesCopy } from "./crm-sales-copy";
import { CrmFollowUpForm } from "./crm-follow-up-form";

export function CrmSalesControls({ conversationId, compact = false, menuOpen, onMenuOpenChange }: {
  conversationId: string;
  compact?: boolean;
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
}) {
  const t = useCrmSalesCopy();
  const workflow = useCrmSalesWorkflow(conversationId);
  const [modal, setModal] = useState<"status" | "schedule" | "reschedule" | "snooze" | null>(null);
  const data = workflow.data;
  const canEdit = Boolean(data?.canEdit);
  const reminder = data?.nextFollowUp;
  const statusControl = <div className="space-y-2">
    <span className="block text-xs text-neutral-400">{t("crmSales.salesStatus")}</span>
    <CustomSelect ariaLabel={t("crmSales.salesStatus")} value={data?.manualStatus ?? ""} searchable={false}
      className="[&_button]:min-h-11" dropdownClassName="[&_button]:min-h-11"
      disabled={!canEdit || workflow.pending} onChange={(value) => { if (canEdit && !workflow.pending) workflow.mutation.mutate({ kind: "status", input: { manualStatus: (value || null) as CrmManualSalesStatus | null } }); }}
      options={[{ value: "", label: t("crmSales.status.automatic") }, ...CRM_MANUAL_SALES_STATUSES.map((status) => ({ value: status, label: salesStatusLabel(status, t) }))]} />
    <p className="text-xs leading-5 text-neutral-500">{t("crmSales.manualHint")}</p>
  </div>;
  const error = workflow.mutation.error ? <p role="alert" className="text-xs text-rose-300">{t("crmSales.saveError")}</p> : null;
  const followUpActions = <div className="flex flex-wrap gap-2">
    {reminder ? <>
      <Button variant="secondary" disabled={workflow.pending || !canEdit || !data?.commercialOutreachAllowed} onClick={() => setModal("reschedule")}>{t("crmSales.reschedule")}</Button>
      <Button variant="secondary" disabled={workflow.pending || !canEdit || !data?.commercialOutreachAllowed} onClick={() => setModal("snooze")}>{t("crmSales.snooze")}</Button>
      <Button variant="secondary" disabled={workflow.pending || !canEdit} onClick={() => workflow.mutation.mutate({ kind: "followUp", taskId: reminder.id, input: { action: "COMPLETE" } })}>{t("crmSales.complete")}</Button>
      <Button variant="secondary" disabled={workflow.pending || !canEdit} onClick={() => workflow.mutation.mutate({ kind: "followUp", taskId: reminder.id, input: { action: "CANCEL" } })}>{t("crmSales.cancel")}</Button>
    </> : <Button variant="secondary" disabled={workflow.pending || !canEdit || !data?.commercialOutreachAllowed} onClick={() => setModal("schedule")}><BellRing size={15} />{t("crmSales.schedule")}</Button>}
  </div>;
  const content = workflow.isLoading ? <p role="status" className="text-xs text-neutral-400">{t("crmSales.loading")}</p>
    : workflow.error || !data ? <div role="alert" className="space-y-2"><p className="text-xs text-rose-300">{t("crmSales.loadError")}</p><Button variant="secondary" onClick={() => void workflow.refetch()}>{t("crmSales.retry")}</Button></div>
    : <>
      <section className="space-y-3"><h3 className="font-medium text-neutral-200">{t("crmSales.salesStatus")}</h3>
        <p className="text-sm text-blue-300">{salesStatusLabel(data.attentionStatus, t)}</p>{statusControl}
        {data.outreachBlockedReason === "DO_NOT_CONTACT" ? <p className="text-xs leading-5 text-amber-300">{t("crmSales.dnc")}</p> : null}
      </section>
      <section className="space-y-3 border-t border-neutral-800 pt-4"><h3 className="font-medium text-neutral-200">{t("crmSales.followUp")}</h3>
        {reminder ? <><p className="break-words text-sm">{reminder.title}</p><p className="text-xs text-neutral-400">{formatDateTime(reminder.effectiveAt)} · {t(Date.parse(reminder.effectiveAt) <= workflow.dataUpdatedAt ? "crmSales.overdue" : "crmSales.scheduled")}</p></>
          : <p className="text-xs text-neutral-400">{data.nextContactAt ? formatDateTime(data.nextContactAt) : t("crmSales.noReminder")}</p>}
        {canEdit ? followUpActions : null}
      </section>{error}
    </>;
  return <>
    {compact ? <ActionMenu triggerClassName="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" menuClassName="absolute right-0 top-11 z-50 w-56 rounded-lg border border-neutral-700 bg-neutral-950 p-1.5 shadow-2xl [&_button]:min-h-11" label={t("crmSales.actions")} open={menuOpen} onOpenChange={onMenuOpenChange}>
      <ActionMenuItem icon={<CircleHelp size={16} />} disabled={!canEdit || workflow.pending} onClick={() => setModal("status")}>{t("crmSales.changeStatus")}</ActionMenuItem>
      <ActionMenuItem icon={<BellRing size={16} />} disabled={!data?.commercialOutreachAllowed || !canEdit || workflow.pending} onClick={() => setModal(reminder ? "reschedule" : "schedule")}>{t("crmSales.followUp")}</ActionMenuItem>
      {reminder ? <>
        <ActionMenuItem icon={<BellRing size={16} />} disabled={!canEdit || workflow.pending} onClick={() => workflow.mutation.mutate({ kind: "followUp", taskId: reminder.id, input: { action: "COMPLETE" } })}>{t("crmSales.complete")}</ActionMenuItem>
        <ActionMenuItem icon={<BellRing size={16} />} disabled={!canEdit || workflow.pending} onClick={() => workflow.mutation.mutate({ kind: "followUp", taskId: reminder.id, input: { action: "CANCEL" } })}>{t("crmSales.cancel")}</ActionMenuItem>
      </> : null}
      {workflow.error ? <ActionMenuItem icon={<CircleHelp size={16} />} onClick={() => void workflow.refetch()}>{t("crmSales.retry")}</ActionMenuItem> : null}
    </ActionMenu> : <div className="space-y-5 [&_button]:min-h-10">{content}</div>}
    <Modal open={modal === "status"} onClose={() => setModal(null)} title={t("crmSales.changeStatus")} size="sm">
      <div className="space-y-3">{statusControl}{error}<Button variant="secondary" onClick={() => setModal(null)}>{t("crmSales.close")}</Button></div>
    </Modal>
    <Modal open={modal !== null && modal !== "status"} onClose={() => setModal(null)} title={t(modal === "snooze" ? "crmSales.snooze" : modal === "reschedule" ? "crmSales.reschedule" : "crmSales.schedule")} size="sm">
      {modal && modal !== "status" ? <CrmFollowUpForm key={`${modal}:${reminder?.id ?? "new"}`} initialAt={reminder?.effectiveAt} initialTitle={reminder?.title} pending={workflow.pending} error={Boolean(workflow.mutation.error)} mode={modal}
        onSubmit={async (at, title) => {
          if (modal === "schedule") await workflow.mutation.mutateAsync({ kind: "schedule", input: { at, title } });
          else if (reminder) await workflow.mutation.mutateAsync({ kind: "followUp", taskId: reminder.id, input: { action: modal === "snooze" ? "SNOOZE" : "RESCHEDULE", at } });
          setModal(null);
        }} /> : null}
    </Modal>
  </>;
}

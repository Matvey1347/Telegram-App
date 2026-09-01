"use client";

import { useState } from "react";
import type {
  CrmAutomationOverride,
  CrmConversationListItem,
  CrmDealAutomationStatus,
  UpdateCrmDealAutomationPayload,
} from "@telegram-system/shared";
import { Button, Input, Select } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/date-format";
import {
  automationTypes,
  overrideOptions,
  TypeOverrideSelect,
} from "./crm-automation-controls";

function toDateTimeInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function CustomerFollowUpSetting({
  deal,
  disabled,
  pending,
  onSave,
}: {
  deal: CrmDealAutomationStatus;
  disabled: boolean;
  pending: boolean;
  onSave: (dueAt: string | null) => Promise<void>;
}) {
  const [value, setValue] = useState(
    toDateTimeInput(deal.customerFollowUp?.dueAt ?? null),
  );
  const parsed = value ? new Date(value) : null;
  const valid = !parsed || !Number.isNaN(parsed.getTime());
  return (
    <div className="mt-3 border-t border-neutral-800 pt-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[220px] flex-1">
          <span className="mb-1 block text-xs text-neutral-400">
            Explicit customer follow-up
          </span>
          <Input
            type="datetime-local"
            value={value}
            disabled={disabled || pending}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <Button
          variant="secondary"
          disabled={disabled || pending || !value || !valid}
          onClick={() => parsed && onSave(parsed.toISOString())}
        >
          Save follow-up
        </Button>
        {deal.customerFollowUp ? (
          <Button
            variant="secondary"
            disabled={disabled || pending}
            onClick={() => onSave(null)}
          >
            Clear
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        This is customer messaging, not an internal CRM task. Saving creates an
        occurrence for the selected time; if it is already due, an eligible
        message may send immediately after all server gates pass.
      </p>
      {deal.customerFollowUp ? (
        <p className="mt-1 text-xs text-neutral-500">
          Configured version {deal.customerFollowUp.version} · due{" "}
          {formatDateTime(deal.customerFollowUp.dueAt)}
        </p>
      ) : null}
    </div>
  );
}

export type CrmAutomationDealSettingsProps = {
  deals: CrmDealAutomationStatus[];
  conversations: CrmConversationListItem[];
  conversationsLoading: boolean;
  conversationsError: boolean;
  canManage: boolean;
  dealPending: boolean;
  followUpPending: boolean;
  dealError: boolean;
  followUpError: boolean;
  onRetryConversations: () => void;
  onUpdate: (
    dealId: string,
    payload: UpdateCrmDealAutomationPayload,
  ) => Promise<void>;
  onProtectedEnable: (dealId: string, override: CrmAutomationOverride) => void;
  onFollowUp: (dealId: string, dueAt: string | null) => Promise<void>;
};

export function CrmAutomationDealSettings(
  props: CrmAutomationDealSettingsProps,
) {
  const disabled = props.dealPending || props.followUpPending;
  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/55 p-4">
      <h3 className="font-medium text-white">Deal controls</h3>
      <p className="mt-1 text-xs text-neutral-400">
        Deal ENABLED never bypasses workspace, Contact, type, conversation,
        account, cutover, or event checks.
      </p>
      {props.conversationsLoading ? (
        <p className="mt-2 text-xs text-neutral-500">
          Loading active Conversations…
        </p>
      ) : null}
      {props.conversationsError ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-xs text-rose-300">
            Conversation options could not be loaded; the current choices are
            preserved.
          </p>
          <Button variant="secondary" onClick={props.onRetryConversations}>
            Retry Conversations
          </Button>
        </div>
      ) : null}
      {!props.deals.length ? (
        <p className="mt-3 text-sm text-neutral-500">
          No Deals are available in this bounded view.
        </p>
      ) : (
        <div className="mt-3 divide-y divide-neutral-800">
          {props.deals.map((deal) => (
            <DealSettingsRow
              key={deal.dealId}
              deal={deal}
              conversations={props.conversations}
              conversationsLoading={props.conversationsLoading}
              conversationsError={props.conversationsError}
              disabled={!props.canManage || disabled}
              dealPending={props.dealPending}
              followUpPending={props.followUpPending}
              onUpdate={props.onUpdate}
              onProtectedEnable={props.onProtectedEnable}
              onFollowUp={props.onFollowUp}
            />
          ))}
        </div>
      )}
      {props.dealError ? (
        <p className="mt-2 text-xs text-rose-300">
          Deal automation settings could not be saved.
        </p>
      ) : null}
      {props.followUpError ? (
        <p className="mt-2 text-xs text-rose-300">
          Customer follow-up configuration could not be saved.
        </p>
      ) : null}
    </section>
  );
}

function DealSettingsRow({
  deal,
  conversations,
  conversationsLoading,
  conversationsError,
  disabled,
  dealPending,
  followUpPending,
  onUpdate,
  onProtectedEnable,
  onFollowUp,
}: {
  deal: CrmDealAutomationStatus;
  conversations: CrmConversationListItem[];
  conversationsLoading: boolean;
  conversationsError: boolean;
  disabled: boolean;
  dealPending: boolean;
  followUpPending: boolean;
  onUpdate: (
    dealId: string,
    payload: UpdateCrmDealAutomationPayload,
  ) => Promise<void>;
  onProtectedEnable: (dealId: string, override: CrmAutomationOverride) => void;
  onFollowUp: (dealId: string, dueAt: string | null) => Promise<void>;
}) {
  const isProtected = deal.eligibleAt === null;
  const options = conversations.some((item) => item.id === deal.conversationId)
    ? conversations
    : deal.conversationId
      ? [
          { id: deal.conversationId } as CrmConversationListItem,
          ...conversations,
        ]
      : conversations;
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">
            Deal {deal.dealId.slice(0, 8)}
          </p>
          <p
            className={
              isProtected
                ? "mt-1 text-xs text-amber-300"
                : "mt-1 text-xs text-neutral-500"
            }
          >
            {isProtected
              ? "Protected legacy Deal · no eligibility cutover"
              : `Deal activation cutover ${formatDateTime(deal.eligibleAt!)}`}
          </p>
        </div>
        <label className="min-w-[190px]">
          <span className="mb-1 block text-xs text-neutral-400">
            Overall policy
          </span>
          <Select
            value={deal.override}
            disabled={disabled}
            onChange={(event) => {
              const override = event.target.value as CrmAutomationOverride;
              if (isProtected && override !== "DISABLED")
                onProtectedEnable(deal.dealId, override);
              else void onUpdate(deal.dealId, { override });
            }}
          >
            {overrideOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {automationTypes.map(({ type, label }) => (
          <TypeOverrideSelect
            key={type}
            label={label}
            value={deal.typeOverrides[type].override}
            enabledAt={deal.typeOverrides[type].enabledAt}
            disabled={disabled}
            onChange={(override) =>
              void onUpdate(deal.dealId, {
                typeOverrides: { [type]: override },
              })
            }
          />
        ))}
        <label>
          <span className="mb-1 block text-xs text-neutral-400">
            Explicit Conversation
          </span>
          <Select
            value={deal.conversationId ?? ""}
            disabled={disabled || conversationsLoading || conversationsError}
            onChange={(event) =>
              void onUpdate(deal.dealId, {
                conversationId: event.target.value || null,
              })
            }
          >
            <option value="">Automatic deterministic choice</option>
            {options.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>
                {conversation.account?.label
                  ? `${conversation.account.label} · `
                  : ""}
                {conversation.peer?.username
                  ? `@${conversation.peer.username}`
                  : conversation.id.slice(0, 8)}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <CustomerFollowUpSetting
        key={`${deal.dealId}:${deal.customerFollowUp?.version ?? 0}:${deal.customerFollowUp?.dueAt ?? "none"}`}
        deal={deal}
        disabled={disabled || dealPending}
        pending={followUpPending}
        onSave={(dueAt) => onFollowUp(deal.dealId, dueAt)}
      />
    </div>
  );
}

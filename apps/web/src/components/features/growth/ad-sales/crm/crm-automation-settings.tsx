"use client";

import { useState } from "react";
import type {
  CrmAutomationLocale,
  CrmAutomationOverride,
  CrmAutomationStatusResponse,
  CrmConversationListItem,
  CrmCustomerAutomationType,
  UpdateCrmDealAutomationPayload,
} from "@telegram-system/shared";
import { Button, Modal, Select } from "@/components/ui/primitives";
import {
  ActivationTime,
  automationTypes,
  TypeOverrideSelect,
} from "./crm-automation-controls";
import { CrmAutomationDealSettings } from "./crm-automation-deal-settings";

type Confirmation =
  | { kind: "workspace" }
  | { kind: "contact" }
  | { kind: "deal"; dealId: string; override: CrmAutomationOverride };

type AutomationSettingsProps = {
  status: CrmAutomationStatusResponse;
  conversations: CrmConversationListItem[];
  conversationsLoading: boolean;
  conversationsError: boolean;
  canManageWorkspace: boolean;
  canManageContact: boolean;
  pending: {
    workspace: boolean;
    contact: boolean;
    deal: boolean;
    followUp: boolean;
  };
  errors: {
    workspace: boolean;
    contact: boolean;
    deal: boolean;
    followUp: boolean;
  };
  onWorkspaceEnabled: (enabled: boolean) => Promise<void>;
  onWorkspaceType: (
    type: CrmCustomerAutomationType,
    enabled: boolean,
  ) => Promise<void>;
  onWorkspaceLocale: (locale: CrmAutomationLocale) => Promise<void>;
  onContactEnabled: (enabled: boolean) => Promise<void>;
  onContactLocale: (locale: CrmAutomationLocale | null) => Promise<void>;
  onContactType: (
    type: CrmCustomerAutomationType,
    override: CrmAutomationOverride,
  ) => Promise<void>;
  onDealUpdate: (
    dealId: string,
    payload: UpdateCrmDealAutomationPayload,
  ) => Promise<void>;
  onFollowUp: (dealId: string, dueAt: string | null) => Promise<void>;
  onRetryConversations: () => void;
};

export function CrmAutomationSettings(props: AutomationSettingsProps) {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const { workspace, contact, deals } = props.status;
  const anyPending =
    props.pending.workspace ||
    props.pending.contact ||
    props.pending.deal ||
    props.pending.followUp;
  const confirm = async () => {
    if (!confirmation) return;
    try {
      if (confirmation.kind === "workspace")
        await props.onWorkspaceEnabled(true);
      if (confirmation.kind === "contact") await props.onContactEnabled(true);
      if (confirmation.kind === "deal")
        await props.onDealUpdate(confirmation.dealId, {
          override: confirmation.override,
        });
      setConfirmation(null);
    } catch {
      // Keep the confirmation open so the user can retry or cancel.
    }
  };
  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-sky-900/60 bg-sky-950/20 px-3 py-2 text-sm text-sky-100">
        Manual Telegram messages stay available whether automation is on or off.
        Workspace and Contact opt-ins never replay historical facts. Explicit
        Deal and follow-up actions may schedule work once every server gate
        passes.
      </p>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/55 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-medium text-white">Workspace safety gates</h3>
            <p className="mt-1 text-xs text-neutral-400">
              Off by default. Enabling this gate does not bulk-enable Contacts
              or Deals.
            </p>
            <ActivationTime
              value={workspace.customerTelegramAutomationsEnabledAt}
            />
          </div>
          <Button
            variant="secondary"
            aria-pressed={workspace.customerTelegramAutomationsEnabled}
            disabled={!props.canManageWorkspace || anyPending}
            onClick={() =>
              workspace.customerTelegramAutomationsEnabled
                ? void props.onWorkspaceEnabled(false)
                : setConfirmation({ kind: "workspace" })
            }
          >
            {workspace.customerTelegramAutomationsEnabled
              ? "Workspace on"
              : "Workspace off"}
          </Button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label>
            <span className="mb-1 block text-xs text-neutral-400">
              Workspace message locale
            </span>
            <Select
              value={workspace.locale}
              disabled={!props.canManageWorkspace || anyPending}
              onChange={(event) =>
                void props.onWorkspaceLocale(
                  event.target.value as CrmAutomationLocale,
                )
              }
            >
              {["en", "ru", "uk"].map((locale) => (
                <option key={locale} value={locale}>
                  {locale.toUpperCase()}
                </option>
              ))}
            </Select>
          </label>
          {automationTypes.map(({ type, label }) => {
            const setting = workspace.typeSettings[type];
            return (
              <div
                key={type}
                className="flex items-center justify-between gap-2 rounded-lg bg-neutral-950/50 px-3 py-2"
              >
                <div>
                  <p className="text-sm text-neutral-200">{label}</p>
                  <ActivationTime value={setting.enabledAt} />
                </div>
                <Button
                  variant="secondary"
                  aria-label={`${label} ${setting.enabled ? "on" : "off"}`}
                  aria-pressed={setting.enabled}
                  disabled={!props.canManageWorkspace || anyPending}
                  onClick={() =>
                    void props.onWorkspaceType(type, !setting.enabled)
                  }
                >
                  {setting.enabled ? "On" : "Off"}
                </Button>
              </div>
            );
          })}
        </div>
        {!props.canManageWorkspace ? (
          <p className="mt-2 text-xs text-neutral-500">
            You do not have permission to manage workspace automation.
          </p>
        ) : null}
        {props.errors.workspace ? (
          <p className="mt-2 text-xs text-rose-300">
            Workspace automation settings could not be saved.
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/55 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-medium text-white">Contact consent</h3>
            <p className="mt-1 text-xs text-neutral-400">
              This Contact remains off until explicitly enabled.
            </p>
            <ActivationTime value={contact.enabledAt} />
          </div>
          <Button
            variant="secondary"
            aria-pressed={contact.enabled}
            disabled={!props.canManageContact || anyPending}
            onClick={() =>
              contact.enabled
                ? void props.onContactEnabled(false)
                : setConfirmation({ kind: "contact" })
            }
          >
            {contact.enabled ? "Contact on" : "Contact off"}
          </Button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label>
            <span className="mb-1 block text-xs text-neutral-400">
              Contact message locale
            </span>
            <Select
              value={contact.locale ?? ""}
              disabled={!props.canManageContact || anyPending}
              onChange={(event) =>
                void props.onContactLocale(
                  event.target.value
                    ? (event.target.value as CrmAutomationLocale)
                    : null,
                )
              }
            >
              <option value="">Workspace default</option>
              {["en", "ru", "uk"].map((locale) => (
                <option key={locale} value={locale}>
                  {locale.toUpperCase()}
                </option>
              ))}
            </Select>
          </label>
          {automationTypes.map(({ type, label }) => (
            <TypeOverrideSelect
              key={type}
              label={label}
              value={contact.typeOverrides[type].override}
              enabledAt={contact.typeOverrides[type].enabledAt}
              disabled={!props.canManageContact || anyPending}
              onChange={(override) => void props.onContactType(type, override)}
            />
          ))}
        </div>
        {!props.canManageContact ? (
          <p className="mt-2 text-xs text-neutral-500">
            You do not have permission to manage this Contact&apos;s automation.
          </p>
        ) : null}
        {props.errors.contact ? (
          <p className="mt-2 text-xs text-rose-300">
            Contact automation settings could not be saved.
          </p>
        ) : null}
      </section>

      <CrmAutomationDealSettings
        deals={deals}
        conversations={props.conversations}
        conversationsLoading={props.conversationsLoading}
        conversationsError={props.conversationsError}
        canManage={props.canManageContact}
        dealPending={props.pending.deal}
        followUpPending={props.pending.followUp}
        dealError={props.errors.deal}
        followUpError={props.errors.followUp}
        onRetryConversations={props.onRetryConversations}
        onUpdate={props.onDealUpdate}
        onProtectedEnable={(dealId, override) =>
          setConfirmation({ kind: "deal", dealId, override })
        }
        onFollowUp={props.onFollowUp}
      />

      <Modal
        open={confirmation !== null}
        onClose={() => {
          if (!anyPending) setConfirmation(null);
        }}
        title={
          confirmation?.kind === "workspace"
            ? "Enable workspace customer automation"
            : confirmation?.kind === "contact"
              ? "Enable Contact automation"
              : "Enable protected Deal automation"
        }
      >
        {confirmation?.kind === "deal" ? (
          <>
            <p className="text-sm text-neutral-200">
              Enabling this protected Deal may schedule a reminder for a
              still-future placement. If the placement is already inside the
              reminder window, an eligible message may send immediately after
              every server gate passes.
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              This does not replay historical publications or completed events.
              An enabled Deal never bypasses the workspace kill switch.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-neutral-200">
              {confirmation?.kind === "workspace"
                ? "Enabling the workspace does not replay or create sends from historical facts, and does not bulk-enable Contacts or Deals."
                : "Enabling this Contact does not replay or create sends from historical facts, and does not enable any protected Deal."}
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              Only future post-cutover facts may send, and every server safety
              gate must still pass.
            </p>
          </>
        )}
        {props.errors.workspace || props.errors.contact || props.errors.deal ? (
          <p className="mt-2 text-xs text-rose-300">
            The setting could not be saved. Nothing was enabled.
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            disabled={anyPending}
            onClick={() => setConfirmation(null)}
          >
            Keep automation off
          </Button>
          <Button disabled={anyPending} onClick={() => void confirm()}>
            {confirmation?.kind === "deal"
              ? "Enable protected Deal"
              : "Allow future messages"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

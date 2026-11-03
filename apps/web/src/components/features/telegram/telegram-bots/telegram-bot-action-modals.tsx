"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useForm } from "react-hook-form";
import type {
  TelegramBotApplicationType,
  TelegramBotRuntimeEnvironment,
} from "@telegram-system/shared";
import type { TelegramBot } from "@/lib/api";
import {
  Button,
  ConfirmDeleteModal,
  CustomSelect,
  FormField,
  Input,
  Modal,
} from "@/components/ui/primitives";
import { runtimeAppPresentation } from "./runtime-app-presentation";
import { RuntimeProfileModal } from "./runtime-profile-modal";

const RuntimeDeletionModal = dynamic(
  () =>
    import("./telegram-bot-runtime-deletion-modal").then(
      (module) => module.TelegramBotRuntimeDeletionModal,
    ),
  { loading: () => null },
);

export type BotRuntimeConfig = {
  bot: TelegramBot;
  environment: TelegramBotRuntimeEnvironment;
};
export type BotDeleteConfirmation = {
  bot: TelegramBot;
  environment?: TelegramBotRuntimeEnvironment;
};
export type BotDeleteChoice = {
  bot: TelegramBot;
  environment: TelegramBotRuntimeEnvironment;
};

export function TelegramBotActionModals({
  createOpen,
  createSaving,
  onCreateClose,
  onCreate,
  switching,
  switchingSaving,
  onSwitchClose,
  onSwitch,
  runtimeConfig,
  runtimeSaving,
  onRuntimeClose,
  onRuntimeSave,
  profileConfig,
  profileSaving,
  onProfileClose,
  onProfileSave,
  deleteConfirmation,
  onDeleteConfirmationClose,
  onConfirmDelete,
  deleteChoice,
  onDeleteChoiceClose,
  onDeleteChoiceRuntime,
  onDeleteChoiceBot,
}: {
  createOpen: boolean;
  createSaving: boolean;
  onCreateClose: () => void;
  onCreate: (values: { botToken: string }) => void;
  switching: TelegramBot | null;
  switchingSaving: boolean;
  onSwitchClose: () => void;
  onSwitch: (applicationType: TelegramBotApplicationType) => void;
  runtimeConfig: BotRuntimeConfig | null;
  runtimeSaving: boolean;
  onRuntimeClose: () => void;
  onRuntimeSave: (botToken: string) => void;
  profileConfig: BotRuntimeConfig | null;
  profileSaving: boolean;
  onProfileClose: () => void;
  onProfileSave: (input: { name?: string }) => void;
  deleteConfirmation: BotDeleteConfirmation | null;
  onDeleteConfirmationClose: () => void;
  onConfirmDelete: () => void | Promise<unknown>;
  deleteChoice: BotDeleteChoice | null;
  onDeleteChoiceClose: () => void;
  onDeleteChoiceRuntime: (environment: TelegramBotRuntimeEnvironment) => void;
  onDeleteChoiceBot: () => void;
}) {
  return (
    <>
      {createOpen ? (
        <CreateBotModal
          open
          saving={createSaving}
          onClose={onCreateClose}
          onSubmit={onCreate}
        />
      ) : null}
      {switching ? (
        <SwitchApplicationModal
          bot={switching}
          saving={switchingSaving}
          onClose={onSwitchClose}
          onSubmit={onSwitch}
        />
      ) : null}
      {runtimeConfig ? (
        <RuntimeTokenModal
          config={runtimeConfig}
          saving={runtimeSaving}
          onClose={onRuntimeClose}
          onSubmit={onRuntimeSave}
        />
      ) : null}
      {profileConfig ? (
        <RuntimeProfileModal
          key={`${profileConfig.bot.id}:${profileConfig.environment}`}
          config={profileConfig}
          saving={profileSaving}
          onClose={onProfileClose}
          onSubmit={onProfileSave}
        />
      ) : null}
      {deleteConfirmation ? (
        <ConfirmDeleteModal
          open
          entityName={
            deleteConfirmation.environment || deleteConfirmation.bot.label
          }
          description={
            deleteConfirmation.environment
              ? `This permanently removes the ${deleteConfirmation.environment.toLowerCase()} token and webhook state.`
              : "This permanently removes every runtime and the bot configuration from this workspace."
          }
          onClose={onDeleteConfirmationClose}
          onConfirm={onConfirmDelete}
          label={
            deleteConfirmation.environment ? "Delete runtime" : "Delete bot"
          }
        />
      ) : null}
      {deleteChoice ? (
        <RuntimeDeletionModal
          choice={deleteChoice}
          onClose={onDeleteChoiceClose}
          onDeleteRuntime={onDeleteChoiceRuntime}
          onDeleteBot={onDeleteChoiceBot}
        />
      ) : null}
    </>
  );
}

function CreateBotModal({
  open,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: (values: { botToken: string }) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ botToken: string }>();
  return (
    <Modal open={open} onClose={onClose} title="Connect Telegram bot">
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <FormField
          label="Bot token"
          required
          error={errors.botToken ? "Required field" : undefined}
        >
          <Input
            placeholder="123456:ABC..."
            {...register("botToken", { required: true })}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Connecting" : "Connect"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RuntimeTokenModal({
  config,
  saving,
  onClose,
  onSubmit,
}: {
  config: BotRuntimeConfig;
  saving: boolean;
  onClose: () => void;
  onSubmit: (botToken: string) => void;
}) {
  const [botToken, setBotToken] = useState("");
  const exists = config.bot.runtimes.some(
    (runtime) => runtime.environment === config.environment,
  );
  return (
    <Modal
      open
      onClose={onClose}
      title={`${exists ? "Update" : "Connect"} ${config.environment === "LOCAL" ? "local" : "production"} runtime`}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(botToken);
        }}
      >
        <p className="text-sm text-neutral-400">
          {config.environment === "PRODUCTION"
            ? "The production token is verified and saved here. It becomes active only after the production API is deployed with a public webhook URL."
            : "The local token is verified and saved here. It activates automatically when this API has a reachable local webhook URL."}
        </p>
        <FormField label="BotFather token" required>
          <Input
            type="password"
            value={botToken}
            onChange={(event) => setBotToken(event.target.value)}
            placeholder="123456:ABC..."
            autoComplete="off"
            required
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !botToken.trim()}>
            {saving ? "Verifying" : exists ? "Save token" : "Connect runtime"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SwitchApplicationModal({
  bot,
  saving,
  onClose,
  onSubmit,
}: {
  bot: TelegramBot;
  saving: boolean;
  onClose: () => void;
  onSubmit: (applicationType: TelegramBotApplicationType) => void;
}) {
  return (
    <Modal open onClose={onClose} title="Change bot app">
      <SwitchApplicationForm
        key={bot.id}
        bot={bot}
        saving={saving}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    </Modal>
  );
}

export function SwitchApplicationForm({
  bot,
  saving,
  onClose,
  onSubmit,
}: {
  bot: TelegramBot;
  saving: boolean;
  onClose: () => void;
  onSubmit: (applicationType: TelegramBotApplicationType) => void;
}) {
  const [applicationType, setApplicationType] =
    useState<TelegramBotApplicationType>(bot.applicationType);
  const options = useMemo(
    () =>
      bot.applications
        .filter((option) => option.eligible)
        .map((option) => ({
          value: option.type,
          label: option.label,
          iconEmoji: runtimeAppPresentation(option.type).emoji,
          tone: "info" as const,
        })),
    [bot],
  );
  const selected = bot.applications.find(
    (option) => option.type === applicationType,
  );
  const current = bot.applications.find(
    (option) => option.type === bot.applicationType,
  );
  const unchanged = applicationType === bot.applicationType;
  const disabled = !selected || unchanged || saving;
  const impactText = unchanged
    ? `${current?.label || "This app"} is currently active. Select a different runtime app to change the bot behavior.`
    : applicationType === "NONE"
      ? `This will stop ${current?.label || "the current runtime"} and remove its webhook. Saved configuration will remain available.`
      : bot.applicationType === "NONE"
        ? `This will enable ${selected?.label || "the selected app"}, configure its webhook, and update the bot commands.`
        : `This will stop ${current?.label || "the current runtime"}, then enable ${selected?.label || "the selected app"}. The webhook and bot commands will be replaced.`;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(applicationType);
      }}
    >
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
        <p className="font-medium">You are changing what {bot.label} does.</p>
        <p className="mt-1 text-amber-100/80">{impactText}</p>
      </div>
      <FormField label="Runtime app">
        <CustomSelect
          value={applicationType}
          onChange={(value) =>
            setApplicationType(value as TelegramBotApplicationType)
          }
          options={options}
          searchable={false}
        />
      </FormField>
      {selected?.unavailableReason ? (
        <p className="text-sm text-amber-300">{selected.unavailableReason}</p>
      ) : null}
      {unchanged ? (
        <p className="text-sm text-neutral-400">
          This app is already selected. Choose another app to make a change.
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={disabled}>
          {saving
            ? "Changing"
            : applicationType === "NONE"
              ? "Disable runtime"
              : `Switch to ${selected?.label || "app"}`}
        </Button>
      </div>
    </form>
  );
}

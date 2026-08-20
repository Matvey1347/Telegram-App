"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Plus } from "lucide-react";
import type {
  TelegramBotApplicationType,
  TelegramBotRuntimeEnvironment,
} from "@telegram-system/shared";
import { AppShell } from "@/components/layout/app-shell";
import {
  Button,
  ConfirmDeleteModal,
  CustomSelect,
  FormField,
  Input,
  Modal,
  PageHeader,
} from "@/components/ui/primitives";
import { runtimeAppPresentation } from "./runtime-app-presentation";
import { QueryContentState } from "@/components/ui/query-content-state";
import { telegramBotsApi, type TelegramBot } from "@/lib/api";
import { telegramAccountKeys } from "@/lib/query-keys";
import { invalidateTelegramAccessQueries } from "@/lib/features/telegram/telegram-query-invalidation";
import {
  reconcileTelegramBotCache,
  removeTelegramBotFromCache,
} from "@/lib/features/telegram/telegram-bot-cache";
import { useAppToast } from "@/providers/toast-provider";
import { TelegramBotCard } from "./telegram-bot-card";

function errorMessage(error: unknown, fallback: string) {
  const responseError = error as { response?: { data?: { message?: string } } };
  return responseError?.response?.data?.message || fallback;
}

export function TelegramBotsPage() {
  const qc = useQueryClient();
  const { pushToast } = useAppToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<TelegramBot | null>(null);
  const [switching, setSwitching] = useState<TelegramBot | null>(null);
  const [runtimeConfig, setRuntimeConfig] = useState<{
    bot: TelegramBot;
    environment: TelegramBotRuntimeEnvironment;
  } | null>(null);
  const botsQuery = useQuery({
    queryKey: telegramAccountKeys.bots(),
    queryFn: telegramBotsApi.list,
  });
  const bots = botsQuery.data || [];
  const createMutation = useMutation({
    mutationFn: telegramBotsApi.create,
    onSuccess: (bot) => {
      reconcileTelegramBotCache(qc, bot);
      void invalidateTelegramAccessQueries(qc, { includeBots: false });
      setCreateOpen(false);
      pushToast("Bot connected and channel access synced.", "success");
    },
    onError: (error: unknown) =>
      pushToast(errorMessage(error, "Failed to connect bot."), "error"),
  });
  const checkMutation = useMutation({
    mutationFn: ({
      id,
      environment,
    }: {
      id: string;
      environment: TelegramBotRuntimeEnvironment;
    }) => telegramBotsApi.checkRuntime(id, environment),
    onSuccess: (bot) => {
      reconcileTelegramBotCache(qc, bot);
      pushToast("Selected runtime checked.", "success");
    },
    onError: (error: unknown) =>
      pushToast(errorMessage(error, "Failed to check bot."), "error"),
  });
  const runtimeTokenMutation = useMutation({
    mutationFn: ({
      botId,
      environment,
      botToken,
      exists,
    }: {
      botId: string;
      environment: TelegramBotRuntimeEnvironment;
      botToken: string;
      exists: boolean;
    }) =>
      exists
        ? telegramBotsApi.updateRuntime(botId, environment, { botToken })
        : telegramBotsApi.connectRuntime(botId, { environment, botToken }),
    onSuccess: (bot) => {
      reconcileTelegramBotCache(qc, bot);
      setRuntimeConfig(null);
      pushToast("Runtime token verified and saved.", "success");
    },
    onError: (error: unknown) =>
      pushToast(errorMessage(error, "Failed to save runtime token."), "error"),
  });
  const removeRuntimeMutation = useMutation({
    mutationFn: ({
      botId,
      environment,
    }: {
      botId: string;
      environment: TelegramBotRuntimeEnvironment;
    }) => telegramBotsApi.removeRuntime(botId, environment),
    onSuccess: (bot) => {
      reconcileTelegramBotCache(qc, bot);
      pushToast("Local runtime removed.", "success");
    },
    onError: (error: unknown) =>
      pushToast(
        errorMessage(error, "Failed to remove local runtime."),
        "error",
      ),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => telegramBotsApi.remove(id),
    onSuccess: (_bot, botId) => {
      removeTelegramBotFromCache(qc, botId);
      void invalidateTelegramAccessQueries(qc, { includeBots: false });
      setDeleting(null);
      pushToast("Bot deleted.", "success");
    },
    onError: (error: unknown) =>
      pushToast(errorMessage(error, "Failed to delete bot."), "error"),
  });
  const switchMutation = useMutation({
    mutationFn: ({
      botId,
      applicationType,
    }: {
      botId: string;
      applicationType: TelegramBotApplicationType;
    }) =>
      telegramBotsApi.switchApplication(botId, {
        applicationType,
      }),
    onSuccess: (bot) => {
      reconcileTelegramBotCache(qc, bot);
      void invalidateTelegramAccessQueries(qc, { includeBots: false });
      setSwitching(null);
      pushToast("Bot runtime updated.", "success");
    },
    onError: (error: unknown) =>
      pushToast(errorMessage(error, "Failed to update bot runtime."), "error"),
  });

  return (
    <AppShell>
      <PageHeader
        title="Telegram Bots"
        subtitle="Connected Bot API tokens, runtime apps, webhooks, and delivery status."
        action={
          <div className="flex gap-2">
            <Link href="/telegram-bots/global-config">
              <Button variant="secondary">Global config</Button>
            </Link>
            <Button onClick={() => setCreateOpen(true)}>
              <span className="inline-flex items-center gap-2">
                <Plus size={16} />
                Connect bot
              </span>
            </Button>
          </div>
        }
      />
      <QueryContentState
        isLoading={botsQuery.isLoading}
        isError={botsQuery.isError}
        isEmpty={!bots.length}
        loadingText="Loading bots"
        errorText="Failed to load Telegram bots."
        emptyText="No Telegram bots connected"
      >
        <div className="grid gap-4 xl:grid-cols-2">
          {bots.map((bot) => (
            <TelegramBotCard
              key={bot.id}
              bot={bot}
              checkingEnvironment={
                checkMutation.isPending &&
                checkMutation.variables?.id === bot.id
                  ? checkMutation.variables.environment
                  : null
              }
              onCheck={(environment) =>
                checkMutation.mutate({ id: bot.id, environment })
              }
              onDelete={() => setDeleting(bot)}
              onSwitch={() => setSwitching(bot)}
              onConfigureRuntime={(environment) =>
                setRuntimeConfig({ bot, environment })
              }
              onRemoveRuntime={(environment) =>
                removeRuntimeMutation.mutate({ botId: bot.id, environment })
              }
            />
          ))}
        </div>
      </QueryContentState>
      <CreateBotModal
        open={createOpen}
        saving={createMutation.isPending}
        onClose={() => setCreateOpen(false)}
        onSubmit={(values) => createMutation.mutate(values)}
      />
      <SwitchApplicationModal
        bot={switching}
        saving={switchMutation.isPending}
        onClose={() => setSwitching(null)}
        onSubmit={(applicationType) =>
          switching &&
          switchMutation.mutate({
            botId: switching.id,
            applicationType,
          })
        }
      />
      <RuntimeTokenModal
        config={runtimeConfig}
        saving={runtimeTokenMutation.isPending}
        onClose={() => setRuntimeConfig(null)}
        onSubmit={(botToken) => {
          if (!runtimeConfig) return;
          runtimeTokenMutation.mutate({
            botId: runtimeConfig.bot.id,
            environment: runtimeConfig.environment,
            botToken,
            exists: runtimeConfig.bot.runtimes.some(
              (runtime) => runtime.environment === runtimeConfig.environment,
            ),
          });
        }}
      />
      <ConfirmDeleteModal
        open={Boolean(deleting)}
        entityName={deleting?.label || ""}
        description="This removes the bot token and runtime state from this workspace."
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting ? deleteMutation.mutateAsync(deleting.id) : undefined
        }
        label="Delete"
      />
    </AppShell>
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
  config: {
    bot: TelegramBot;
    environment: TelegramBotRuntimeEnvironment;
  } | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (botToken: string) => void;
}) {
  const [botToken, setBotToken] = useState("");
  const exists = config?.bot.runtimes.some(
    (runtime) => runtime.environment === config?.environment,
  );
  return (
    <Modal
      open={Boolean(config)}
      onClose={onClose}
      title={`${exists ? "Update" : "Connect"} ${config?.environment === "LOCAL" ? "local" : "production"} runtime`}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(botToken);
        }}
      >
        <p className="text-sm text-neutral-400">
          The token is verified with Telegram before saving and is never shown
          again.
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
  bot: TelegramBot | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (applicationType: TelegramBotApplicationType) => void;
}) {
  return (
    <Modal open={Boolean(bot)} onClose={onClose} title="Change bot app">
      {bot ? (
        <SwitchApplicationForm
          key={bot.id}
          bot={bot}
          saving={saving}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      ) : null}
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

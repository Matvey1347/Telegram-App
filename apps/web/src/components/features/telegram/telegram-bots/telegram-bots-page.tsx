"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Headphones, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button, PageHeader } from "@/components/ui/primitives";
import { QueryContentState } from "@/components/ui/query-content-state";
import { telegramBotsApi, type TelegramBot } from "@/lib/api";
import type {
  SupportProduct,
  TelegramBotApplicationType,
  TelegramBotRuntimeEnvironment,
} from "@telegram-system/shared";
import { telegramAccountKeys } from "@/lib/query-keys";
import { invalidateTelegramAccessQueries } from "@/lib/features/telegram/telegram-query-invalidation";
import {
  reconcileTelegramBotCache,
  removeTelegramBotFromCache,
} from "@/lib/features/telegram/telegram-bot-cache";
import { useAppToast } from "@/providers/toast-provider";
import { TelegramBotCard } from "./telegram-bot-card";
import { ConfiguredBotCards } from "./configured-bot-cards";
import {
  type BotDeleteChoice,
  type BotDeleteConfirmation,
  type BotRuntimeConfig,
} from "./telegram-bot-action-modals";
import {
  TelegramSupportInbox,
  useTelegramSupport,
} from "./telegram-support-inbox";

const TelegramBotActionModalsLazy = dynamic(
  () =>
    import("./telegram-bot-action-modals").then(
      (module) => module.TelegramBotActionModals,
    ),
  { loading: () => null },
);

function errorMessage(error: unknown, fallback: string) {
  const responseError = error as { response?: { data?: { message?: string } } };
  return responseError?.response?.data?.message || fallback;
}

export function TelegramBotsPage({ tab = "bots" }: { tab?: "bots" | "support" }) {
  const router = useRouter();
  const qc = useQueryClient();
  const support = useTelegramSupport();
  const [product, setProduct] = useState<SupportProduct>();
  const supportBots = support.data ?? [];
  const needsReply = supportBots.reduce(
    (total, bot) => total + bot.needsReply,
    0,
  );
  const { pushToast } = useAppToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] =
    useState<BotDeleteConfirmation | null>(null);
  const [deleteChoice, setDeleteChoice] = useState<BotDeleteChoice | null>(
    null,
  );
  const [switching, setSwitching] = useState<TelegramBot | null>(null);
  const [runtimeConfig, setRuntimeConfig] = useState<BotRuntimeConfig | null>(
    null,
  );
  const [profileConfig, setProfileConfig] = useState<BotRuntimeConfig | null>(
    null,
  );
  const botsQuery = useQuery({
    queryKey: telegramAccountKeys.bots(),
    queryFn: telegramBotsApi.list,
  });
  const bots = botsQuery.data ?? [];
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
      pushToast("Bot links and runtime status refreshed.", "success");
    },
    onError: (error: unknown) =>
      pushToast(errorMessage(error, "Failed to refresh bot."), "error"),
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
  const profileMutation = useMutation({
    mutationFn: ({
      botId,
      environment,
      name,
    }: {
      botId: string;
      environment: TelegramBotRuntimeEnvironment;
      name?: string;
    }) =>
      profileConfig?.bot.applicationType === "FINANCE"
        ? telegramBotsApi.updateFinanceBranding(botId, environment, {
            name,
          })
        : telegramBotsApi.updateRuntimeProfile(botId, environment, {
            name,
          }),
    onSuccess: (bot) => {
      reconcileTelegramBotCache(qc, bot);
      setProfileConfig(null);
      pushToast("Bot branding updated.", "success");
    },
    onError: (error: unknown) =>
      pushToast(
        errorMessage(error, "Failed to update Telegram profile."),
        "error",
      ),
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
      setDeleteConfirmation(null);
      pushToast("Runtime removed.", "success");
    },
    onError: (error: unknown) =>
      pushToast(errorMessage(error, "Failed to remove runtime."), "error"),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => telegramBotsApi.remove(id),
    onSuccess: (_bot, botId) => {
      removeTelegramBotFromCache(qc, botId);
      void invalidateTelegramAccessQueries(qc, { includeBots: false });
      setDeleteConfirmation(null);
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

  const managedBots = bots.filter((bot) => bot.applicationType === "FINANCE");
  const connectedBots = bots.filter((bot) => bot.applicationType !== "FINANCE");
  const renderBot = (bot: TelegramBot) => (
    <TelegramBotCard
      key={bot.id}
      bot={bot}
      support={
        bot.applicationType === "FINANCE"
          ? supportBots.find((item) => item.product === "GROSHLY")
          : undefined
      }
      checkingEnvironment={
        checkMutation.isPending && checkMutation.variables?.id === bot.id
          ? checkMutation.variables.environment
          : null
      }
      onCheck={(environment) =>
        checkMutation.mutate({ id: bot.id, environment })
      }
      onRequestDelete={(environment) => setDeleteChoice({ bot, environment })}
      onSwitch={() => setSwitching(bot)}
      onConfigureRuntime={(environment) =>
        setRuntimeConfig({ bot, environment })
      }
      onEditProfile={(environment) => setProfileConfig({ bot, environment })}
    />
  );

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
      <div className="mb-4 flex gap-2" aria-label="Telegram Bots sections">
        <Button
          variant={tab === "bots" ? undefined : "secondary"}
          aria-pressed={tab === "bots"}
          onClick={() => { if (tab !== "bots") router.push("/telegram-bots", { scroll: false }); }}
        >
          <Bot aria-hidden="true" />
          Bots
        </Button>
        <Button
          variant={tab === "support" ? undefined : "secondary"}
          aria-pressed={tab === "support"}
          onClick={() => { if (tab !== "support") router.push("/telegram-bots?tab=support", { scroll: false }); }}
        >
          <Headphones aria-hidden="true" />
          Support{" "}
          {needsReply > 0 && (
            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-700 px-1 text-xs font-semibold text-white">
              {needsReply}
            </span>
          )}
        </Button>
      </div>
      {tab === "support" && (
        <TelegramSupportInbox
          product={product}
          onProduct={setProduct}
        />
      )}
      {tab === "bots" && (
        <ConfiguredBotCards
          support={supportBots.find((bot) => bot.product === "NEXELOQ")}
        >
          {managedBots.length ? managedBots.map(renderBot) : undefined}
        </ConfiguredBotCards>
      )}
      {tab === "bots" &&
      (connectedBots.length || botsQuery.isLoading || botsQuery.isError) ? (
        <div className="mt-6">
          <QueryContentState
            isLoading={botsQuery.isLoading}
            isError={botsQuery.isError}
            isEmpty={!connectedBots.length}
            loadingText="Loading bots"
            errorText="Failed to load Telegram bots."
            emptyText=""
          >
            <div className="grid gap-4 xl:grid-cols-2">
              {connectedBots.map(renderBot)}
            </div>
          </QueryContentState>
        </div>
      ) : null}
      {createOpen ||
      switching ||
      runtimeConfig ||
      profileConfig ||
      deleteConfirmation ||
      deleteChoice ? (
        <TelegramBotActionModalsLazy
          createOpen={createOpen}
          createSaving={createMutation.isPending}
          onCreateClose={() => setCreateOpen(false)}
          onCreate={(values) => createMutation.mutate(values)}
          switching={switching}
          switchingSaving={switchMutation.isPending}
          onSwitchClose={() => setSwitching(null)}
          onSwitch={(applicationType) =>
            switching &&
            switchMutation.mutate({ botId: switching.id, applicationType })
          }
          runtimeConfig={runtimeConfig}
          runtimeSaving={runtimeTokenMutation.isPending}
          onRuntimeClose={() => setRuntimeConfig(null)}
          onRuntimeSave={(botToken) => {
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
          profileConfig={profileConfig}
          profileSaving={profileMutation.isPending}
          onProfileClose={() => setProfileConfig(null)}
          onProfileSave={({ name }) => {
            if (!profileConfig) return;
            profileMutation.mutate({
              botId: profileConfig.bot.id,
              environment: profileConfig.environment,
              name,
            });
          }}
          deleteConfirmation={deleteConfirmation}
          onDeleteConfirmationClose={() => setDeleteConfirmation(null)}
          onConfirmDelete={() =>
            !deleteConfirmation
              ? undefined
              : deleteConfirmation.environment
                ? removeRuntimeMutation.mutateAsync({
                    botId: deleteConfirmation.bot.id,
                    environment: deleteConfirmation.environment,
                  })
                : deleteMutation.mutateAsync(deleteConfirmation.bot.id)
          }
          deleteChoice={deleteChoice}
          onDeleteChoiceClose={() => setDeleteChoice(null)}
          onDeleteChoiceRuntime={(environment) => {
            if (!deleteChoice) return;
            setDeleteConfirmation({ bot: deleteChoice.bot, environment });
            setDeleteChoice(null);
          }}
          onDeleteChoiceBot={() => {
            if (!deleteChoice) return;
            setDeleteConfirmation({ bot: deleteChoice.bot });
            setDeleteChoice(null);
          }}
        />
      ) : null}
    </AppShell>
  );
}

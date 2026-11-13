"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Link2, Link2Off, RefreshCw } from "lucide-react";
import { ActionMenu, ActionMenuItem } from "@/components/ui/action-menu";
import { AppShell } from "@/components/layout/app-shell";
import {
  Button,
  Card,
  LoadingState,
  PageHeader,
} from "@/components/ui/primitives";
import { authApi, telegramSystemBotApi } from "@/lib/api";
import { authKeys, telegramSystemBotKeys } from "@/lib/query-keys";

type LinkCode = {
  token: string;
  botUsername: string;
  expiresAt: string;
  botRuntimes?: Array<{
    environment: "LOCAL" | "PRODUCTION";
    username: string | null;
    selected: boolean;
  }>;
};

export function NotificationSettingsPage() {
  const queryClient = useQueryClient();
  const [groupLink, setGroupLink] = useState<LinkCode | null>(null);
  const [accountLink, setAccountLink] = useState<LinkCode | null>(null);
  const me = useQuery({ queryKey: authKeys.me(), queryFn: authApi.me });
  const workspaceId = me.data?.workspace.id ?? "";
  const canManage =
    me.data?.workspace.access?.isOwner === true ||
    me.data?.workspace.access?.featureIds.includes("workspace") === true ||
    me.data?.workspace.role === "owner" ||
    me.data?.workspace.role === "admin";
  const group = useQuery({
    queryKey: telegramSystemBotKeys.notificationGroup(workspaceId),
    queryFn: telegramSystemBotApi.notificationGroup,
    enabled: !!workspaceId,
  });
  const account = useQuery({
    queryKey: telegramSystemBotKeys.notificationAccount(workspaceId),
    queryFn: telegramSystemBotApi.notificationAccount,
    enabled: !!workspaceId,
  });
  const refreshGroup = () =>
    queryClient.invalidateQueries({
      queryKey: telegramSystemBotKeys.notificationGroup(workspaceId),
      exact: true,
    });
  const refreshAccount = () =>
    queryClient.invalidateQueries({
      queryKey: telegramSystemBotKeys.notificationAccount(workspaceId),
      exact: true,
    });
  const groupLinkMutation = useMutation({
    mutationFn: telegramSystemBotApi.createNotificationGroupLink,
    onSuccess: setGroupLink,
  });
  const accountLinkMutation = useMutation({
    mutationFn: telegramSystemBotApi.createNotificationAccountLink,
    onSuccess: setAccountLink,
  });
  const disconnectGroup = useMutation({
    mutationFn: telegramSystemBotApi.disconnectNotificationGroup,
    onSuccess: async () => {
      setGroupLink(null);
      await refreshGroup();
    },
  });
  const disconnectAccount = useMutation({
    mutationFn: telegramSystemBotApi.disconnectNotificationAccount,
    onSuccess: async () => {
      setAccountLink(null);
      await refreshAccount();
    },
  });

  return (
    <AppShell>
      <div className="min-w-0 space-y-5">
        <PageHeader
          title="Notifications"
          subtitle="Choose the workspace account and Telegram group for notifications."
        />
        {me.isLoading ? (
          <LoadingState />
        ) : me.isError ? (
          <p role="alert" className="text-sm text-rose-300">
            Не удалось загрузить настройки рабочего пространства.
          </p>
        ) : !canManage ? (
          <p role="alert" className="text-sm text-rose-300">
            Управлять настройками уведомлений могут только владельцы и
            администраторы рабочего пространства.
          </p>
        ) : (
          <div className="space-y-4">
            <Card className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Системный бот Nexeloq
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-400">
                  Бот работает в окружении этого API. Получатель личных
                  уведомлений и группа ниже — независимые настройки workspace, а
                  не привязки к аккаунту администратора, который сейчас открыл
                  страницу.
                </p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Бот текущего окружения
                </p>
                <p className="mt-2 text-base font-semibold text-white">
                  {group.data?.botUsername ? (
                    <a
                      href={`https://t.me/${group.data.botUsername}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-blue-300 hover:text-blue-200"
                    >
                      @{group.data.botUsername} <ExternalLink size={14} />
                    </a>
                  ) : (
                    "Системный бот не настроен"
                  )}
                </p>
              </div>
            </Card>

            <div className="grid min-w-0 gap-4 xl:grid-cols-2">
              <Card className="min-w-0 space-y-3">
                <header className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Личные уведомления
                    </p>
                    <h2 className="mt-2 truncate text-base font-semibold text-white">
                      {account.isLoading
                        ? "Загрузка…"
                        : account.data?.connected
                          ? account.data.displayName ||
                            account.data.telegramUsername?.replace(/^/, "@") ||
                            "Telegram-аккаунт подключён"
                          : "Аккаунт не подключён"}
                    </h2>
                    <p className="mt-1 text-sm text-neutral-400">
                      {account.data?.connected
                        ? "Сообщения от бота будут приходить на этот аккаунт для всего workspace."
                        : "Подключите Telegram-аккаунт, на который бот будет отправлять личные уведомления."}
                    </p>
                  </div>
                  <ActionMenu label="Действия с аккаунтом уведомлений">
                    <ActionMenuItem
                      icon={<Link2 size={16} />}
                      disabled={accountLinkMutation.isPending}
                      onClick={() => accountLinkMutation.mutate()}
                    >
                      {account.data?.connected
                        ? "Изменить аккаунт"
                        : "Подключить аккаунт"}
                    </ActionMenuItem>
                    <ActionMenuItem
                      icon={<RefreshCw size={16} />}
                      disabled={account.isFetching}
                      onClick={() => void account.refetch()}
                    >
                      Обновить статус
                    </ActionMenuItem>
                    {account.data?.connected ? (
                      <ActionMenuItem
                        icon={<Link2Off size={16} />}
                        danger
                        disabled={disconnectAccount.isPending}
                        onClick={() => disconnectAccount.mutate()}
                      >
                        Отключить аккаунт
                      </ActionMenuItem>
                    ) : null}
                  </ActionMenu>
                </header>
                {account.isError ? (
                  <p role="alert" className="text-sm text-rose-300">
                    Не удалось загрузить аккаунт уведомлений. Обновите статус.
                  </p>
                ) : null}
                {accountLink ? (
                  <div className="space-y-2 rounded-lg border border-blue-900/70 bg-blue-950/20 p-3">
                    <p className="text-sm text-neutral-200">
                      Откройте бота из аккаунта, на который должны приходить
                      уведомления. Настройка адресата общая для workspace;
                      запустите оба окружения, если уведомления нужны и от dev,
                      и от production бота:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(
                        accountLink.botRuntimes?.filter(
                          (runtime) => runtime.username,
                        ) ?? [
                          {
                            environment: "LOCAL" as const,
                            username: accountLink.botUsername,
                            selected: true,
                          },
                        ]
                      ).map((runtime) => (
                        <a
                          key={runtime.environment}
                          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
                          href={`https://t.me/${runtime.username}?start=workspace_notify_${accountLink.token}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {runtime.environment === "LOCAL"
                            ? "Открыть dev бот"
                            : "Открыть production бот"}
                          <ExternalLink size={15} />
                        </a>
                      ))}
                    </div>
                    <p className="text-xs text-neutral-500">
                      Ссылка действует до{" "}
                      {new Date(accountLink.expiresAt).toLocaleString()}. После
                      запуска бота обновите статус здесь.
                    </p>
                  </div>
                ) : null}
                {accountLinkMutation.isError || disconnectAccount.isError ? (
                  <p role="alert" className="text-sm text-rose-300">
                    Не удалось изменить аккаунт уведомлений. Проверьте
                    доступность бота и повторите попытку.
                  </p>
                ) : null}
              </Card>

              <Card className="min-w-0 space-y-3">
                <header className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Групповые уведомления
                    </p>
                    <h2 className="mt-2 truncate text-base font-semibold text-white">
                      {group.isLoading
                        ? "Загрузка…"
                        : group.data?.connected
                          ? group.data.chatTitle || "Telegram-группа подключена"
                          : "Группа не подключена"}
                    </h2>
                    <p className="mt-1 text-sm text-neutral-400">
                      Срочные ошибки и уведомления о расписании отправляются в
                      эту группу.
                    </p>
                  </div>
                  <ActionMenu label="Действия с группой уведомлений">
                    <ActionMenuItem
                      icon={<Link2 size={16} />}
                      disabled={groupLinkMutation.isPending}
                      onClick={() => groupLinkMutation.mutate()}
                    >
                      {group.data?.connected
                        ? "Изменить группу"
                        : "Подключить группу"}
                    </ActionMenuItem>
                    <ActionMenuItem
                      icon={<RefreshCw size={16} />}
                      disabled={group.isFetching}
                      onClick={() => void group.refetch()}
                    >
                      Обновить статус
                    </ActionMenuItem>
                    {group.data?.connected ? (
                      <ActionMenuItem
                        icon={<Link2Off size={16} />}
                        danger
                        disabled={disconnectGroup.isPending}
                        onClick={() => disconnectGroup.mutate()}
                      >
                        Отключить группу
                      </ActionMenuItem>
                    ) : null}
                  </ActionMenu>
                </header>
                {group.isError ? (
                  <p role="alert" className="text-sm text-rose-300">
                    Не удалось загрузить группу. Обновите статус.
                  </p>
                ) : null}
                {groupLink ? (
                  <div className="space-y-2 rounded-lg border border-blue-900/70 bg-blue-950/20 p-3">
                    <p className="text-sm text-neutral-200">
                      Добавьте в нужную группу ботов обоих окружений, если она
                      должна получать сообщения и из dev, и из production.
                      Команду привязки отправьте от бота текущего окружения:
                    </p>
                    <p className="text-xs text-neutral-400">
                      {groupLink.botRuntimes
                        ?.filter((runtime) => runtime.username)
                        .map(
                          (runtime) =>
                            `@${runtime.username} (${runtime.environment})`,
                        )
                        .join(" · ") || `@${groupLink.botUsername}`}
                    </p>
                    <code className="block select-all break-all rounded-lg bg-neutral-950 p-2 text-sm text-blue-200">
                      /connect_workspace {groupLink.token}
                    </code>
                    <p className="text-xs text-neutral-500">
                      Код действует до{" "}
                      {new Date(groupLink.expiresAt).toLocaleString()}. После
                      команды обновите статус.
                    </p>
                  </div>
                ) : null}
                {groupLinkMutation.isError || disconnectGroup.isError ? (
                  <p role="alert" className="text-sm text-rose-300">
                    Не удалось изменить группу уведомлений. Проверьте
                    доступность бота и повторите попытку.
                  </p>
                ) : null}
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

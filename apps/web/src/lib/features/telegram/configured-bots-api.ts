import { api } from "@/lib/api";

export type ConfiguredBotsOverview = {
  systemBot: null | {
    runtimes: Array<{
      environment: "LOCAL" | "PRODUCTION";
      username: string | null;
      name: string | null;
      description: string | null;
      avatarUrl: string | null;
      configured: boolean;
      selected: boolean;
    }>;
    analytics: {
      registeredUsers: number;
      enabledUsers: number;
      activeUsers: number;
    };
  };
  financeBot: null | {
    status:
      | "AVAILABLE"
      | "NOT_CONFIGURED"
      | "MIGRATION_REQUIRED"
      | "UNAVAILABLE";
    bots: Array<{
      id: string;
      managementBotId?: string | null;
      environment: "LOCAL" | "PRODUCTION";
      username: string | null;
      name: string | null;
      description: string | null;
      avatarUpdatedAt?: string | null;
      avatarUrl: string;
      faviconUrl?: string | null;
      faviconLightUrl?: string | null;
      registeredUsers: number;
      profiles: number;
    }>;
  };
};

export type ConfiguredFinanceUsers = {
  items: Array<{
    id: string;
    telegramUserId: string;
    registeredAt: string;
    lastActivityAt: string;
    profile: null | {
      defaultCurrency: string;
      accounts: number;
      transactions: number;
    };
  }>;
  nextCursor: string | null;
};

export const configuredBotsApi = {
  overview: async () =>
    (await api.get<ConfiguredBotsOverview>("/telegram-bots/configured")).data,
  refreshSystemAvatars: async () =>
    (await api.post("/telegram-bots/configured/system/avatars/refresh")).data,
  refreshFinanceAvatars: async () =>
    (await api.post("/telegram-bots/configured/finance/avatars/refresh")).data,
  updateSystemProfile: async (
    environment: "LOCAL" | "PRODUCTION",
    input: { name?: string; description?: string },
  ) => {
    const form = new FormData();
    if (input.name) form.set("name", input.name);
    if (input.description !== undefined)
      form.set("description", input.description);
    form.set("confirmTelegramUpdate", "true");
    return (
      await api.patch<ConfiguredBotsOverview>(
        `/telegram-bots/configured/system/${environment}/profile`,
        form,
      )
    ).data;
  },
  updateFinanceProfile: async (
    environment: "LOCAL" | "PRODUCTION",
    input: { name?: string; description?: string },
  ) => {
    const form = new FormData();
    if (input.name !== undefined) form.set("name", input.name);
    if (input.description !== undefined)
      form.set("description", input.description);
    form.set("confirmTelegramUpdate", "true");
    return (
      await api.patch<ConfiguredBotsOverview>(
        `/telegram-bots/configured/finance/${environment}/profile`,
        form,
      )
    ).data;
  },
  financeUsers: async (environment: "LOCAL" | "PRODUCTION") =>
    (
      await api.get<ConfiguredFinanceUsers>(
        "/telegram-bots/configured/finance/users",
        {
          params: { environment },
        },
      )
    ).data,
};

import type { AxiosInstance } from "axios";
import type {
  GreeterAnalytics,
  GreeterAnalyticsQuery,
  GreeterBroadcastEstimate,
  GreeterBroadcastInput,
  GreeterBroadcastView,
  GreeterButtonRows,
  GreeterChannelOverrideInput,
  GreeterChannelView,
  GreeterConfigInput,
  GreeterOverview,
  GreeterSequenceDetail,
  GreeterSequenceStepInput,
  GreeterSequenceSummary,
  GreeterSequenceTrigger,
  GreeterSequenceVersionView,
  GreeterTemplateContextInput,
  GreeterTemplatePreview,
  GreeterTestModeEnableInput,
  GreeterTestModeResolveInput,
  GreeterTesterLookup,
  GreeterTestSessionView,
  GreeterUsersQuery,
  GreeterUsersResponse,
} from "@telegram-system/shared";

type SequenceInput = {
  name: string;
  trigger: GreeterSequenceTrigger;
  enabled?: boolean;
  channelId?: string | null;
};

function queryString(values: Record<string, unknown>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });
  const result = params.toString();
  return result ? `?${result}` : "";
}

export function createGreeterApi(api: AxiosInstance) {
  const root = (botId: string) => `/telegram-bots/${botId}/greeter`;
  return {
    overview: async (botId: string) =>
      (await api.get<GreeterOverview>(root(botId))).data,
    updateConfig: async (botId: string, input: GreeterConfigInput) =>
      (await api.patch<GreeterOverview>(`${root(botId)}/config`, input)).data,
    publishConfig: async (botId: string, draftRevision: number) =>
      (
        await api.post<GreeterOverview>(`${root(botId)}/config/publish`, {
          draftRevision,
        })
      ).data,
    connectChannel: async (botId: string, channelId: string) =>
      (
        await api.post<GreeterChannelView>(`${root(botId)}/channels`, {
          channelId,
        })
      ).data,
    channels: async (botId: string) =>
      (await api.get<GreeterChannelView[]>(`${root(botId)}/channels`)).data,
    updateChannel: async (
      botId: string,
      channelId: string,
      input: GreeterChannelOverrideInput,
    ) =>
      (
        await api.patch<GreeterChannelView>(
          `${root(botId)}/channels/${channelId}`,
          input,
        )
      ).data,
    disconnectChannel: async (botId: string, channelId: string) =>
      (await api.delete(`${root(botId)}/channels/${channelId}`)).data,
    refreshPermissions: async (botId: string, channelId: string) =>
      (
        await api.post<GreeterChannelView>(
          `${root(botId)}/channels/${channelId}/permissions/refresh`,
        )
      ).data,
    users: async (botId: string, query: GreeterUsersQuery) =>
      (
        await api.get<GreeterUsersResponse>(
          `${root(botId)}/users${queryString(query)}`,
        )
      ).data,
    analytics: async (botId: string, query: GreeterAnalyticsQuery) =>
      (
        await api.get<GreeterAnalytics>(
          `${root(botId)}/analytics${queryString(query)}`,
        )
      ).data,
    previewTemplate: async (
      botId: string,
      messageText: string,
      context: GreeterTemplateContextInput,
      buttons?: GreeterButtonRows,
    ) =>
      (
        await api.post<GreeterTemplatePreview>(`${root(botId)}/preview`, {
          messageText,
          buttons,
          ...context,
        })
      ).data,
    sequences: async (botId: string) =>
      (await api.get<GreeterSequenceSummary[]>(`${root(botId)}/automations`))
        .data,
    sequence: async (botId: string, sequenceId: string) =>
      (
        await api.get<GreeterSequenceDetail>(
          `${root(botId)}/automations/${sequenceId}`,
        )
      ).data,
    createSequence: async (botId: string, input: SequenceInput) =>
      (
        await api.post<GreeterSequenceDetail>(
          `${root(botId)}/automations`,
          input,
        )
      ).data,
    updateSequence: async (
      botId: string,
      sequenceId: string,
      input: Partial<SequenceInput>,
    ) =>
      (
        await api.patch<GreeterSequenceDetail>(
          `${root(botId)}/automations/${sequenceId}`,
          input,
        )
      ).data,
    saveDraft: async (
      botId: string,
      sequenceId: string,
      draftRevision: number,
      steps: GreeterSequenceStepInput[],
    ) =>
      (
        await api.put<GreeterSequenceDetail>(
          `${root(botId)}/automations/${sequenceId}/draft`,
          { draftRevision, steps },
        )
      ).data,
    publishSequence: async (
      botId: string,
      sequenceId: string,
      draftRevision: number,
    ) =>
      (
        await api.post<GreeterSequenceVersionView>(
          `${root(botId)}/automations/${sequenceId}/publish`,
          { draftRevision },
        )
      ).data,
    sequenceVersion: async (
      botId: string,
      sequenceId: string,
      versionId: string,
    ) =>
      (
        await api.get<GreeterSequenceVersionView>(
          `${root(botId)}/automations/${sequenceId}/versions/${versionId}`,
        )
      ).data,
    previewSequence: async (
      botId: string,
      sequenceId: string,
      context: GreeterTemplateContextInput,
    ) =>
      (
        await api.post<GreeterTemplatePreview[]>(
          `${root(botId)}/automations/${sequenceId}/preview`,
          context,
        )
      ).data,
    testers: async (botId: string, search: string) =>
      (
        await api.get<GreeterTesterLookup[]>(
          `${root(botId)}/testers${queryString({ search })}`,
        )
      ).data,
    testMode: async (botId: string) =>
      (
        await api.get<GreeterTestSessionView | null>(
          `${root(botId)}/test-mode`,
        )
      ).data,
    resolveTestUser: async (
      botId: string,
      input: GreeterTestModeResolveInput,
    ) =>
      (
        await api.post<GreeterTesterLookup>(
          `${root(botId)}/test-mode/resolve`,
          input,
        )
      ).data,
    enableTestMode: async (
      botId: string,
      input: GreeterTestModeEnableInput,
    ) =>
      (
        await api.put<GreeterTestSessionView>(
          `${root(botId)}/test-mode`,
          input,
        )
      ).data,
    resetTestMode: async (botId: string) =>
      (
        await api.post<GreeterTestSessionView>(
          `${root(botId)}/test-mode/reset`,
        )
      ).data,
    disableTestMode: async (botId: string) =>
      (
        await api.delete<GreeterTestSessionView | null>(
          `${root(botId)}/test-mode`,
        )
      ).data,
    setTester: async (
      botId: string,
      sequenceId: string,
      telegramBotUserId: string,
      channelId: string,
    ) =>
      (
        await api.put<GreeterTestSessionView>(
          `${root(botId)}/automations/${sequenceId}/tester`,
          { telegramBotUserId, channelId, enabled: true },
        )
      ).data,
    startTest: async (botId: string, sequenceId: string) =>
      (
        await api.post<GreeterTestSessionView>(
          `${root(botId)}/automations/${sequenceId}/test/run`,
        )
      ).data,
    resetTest: async (botId: string, sequenceId: string) =>
      (
        await api.post<GreeterTestSessionView>(
          `${root(botId)}/automations/${sequenceId}/test/reset`,
        )
      ).data,
    clearTester: async (botId: string, sequenceId: string) =>
      (
        await api.delete<GreeterTestSessionView>(
          `${root(botId)}/automations/${sequenceId}/tester`,
        )
      ).data,
    broadcasts: async (botId: string) =>
      (await api.get<GreeterBroadcastView[]>(`${root(botId)}/broadcasts`)).data,
    broadcast: async (botId: string, broadcastId: string) =>
      (
        await api.get<GreeterBroadcastView>(
          `${root(botId)}/broadcasts/${broadcastId}`,
        )
      ).data,
    createBroadcast: async (botId: string, input: GreeterBroadcastInput) =>
      (await api.post<GreeterBroadcastView>(`${root(botId)}/broadcasts`, input))
        .data,
    updateBroadcast: async (
      botId: string,
      broadcastId: string,
      input: GreeterBroadcastInput,
    ) =>
      (
        await api.patch<GreeterBroadcastView>(
          `${root(botId)}/broadcasts/${broadcastId}`,
          input,
        )
      ).data,
    estimateBroadcast: async (botId: string, broadcastId: string) =>
      (
        await api.post<GreeterBroadcastEstimate>(
          `${root(botId)}/broadcasts/${broadcastId}/estimate`,
        )
      ).data,
    sendBroadcastNow: async (botId: string, broadcastId: string) =>
      (
        await api.post<GreeterBroadcastView>(
          `${root(botId)}/broadcasts/${broadcastId}/send-now`,
        )
      ).data,
    scheduleBroadcast: async (
      botId: string,
      broadcastId: string,
      scheduledAt: string,
    ) =>
      (
        await api.post<GreeterBroadcastView>(
          `${root(botId)}/broadcasts/${broadcastId}/schedule`,
          { scheduledAt },
        )
      ).data,
    cancelBroadcast: async (botId: string, broadcastId: string) =>
      (
        await api.post<GreeterBroadcastView>(
          `${root(botId)}/broadcasts/${broadcastId}/cancel`,
        )
      ).data,
  };
}

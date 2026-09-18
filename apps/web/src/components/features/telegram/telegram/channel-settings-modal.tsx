"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Cable,
  ChartNoAxesCombined,
  Circle,
  CircleCheck,
  CircleDotDashed,
  Palette,
  Sprout,
  CalendarClock,
} from "lucide-react";
import type { CurrencySettings, TelegramChannel } from "@/lib/api";
import {
  telegramChannelsApi,
  telegramPublicationSchedulesApi,
} from "@/lib/api";
import {
  telegramChannelKeys,
  telegramPublicationScheduleKeys,
} from "@/lib/query-keys";
import {
  Button,
  FormField,
  Input,
  Modal,
  ToggleRow,
} from "@/components/ui/primitives";
import { TelegramEntityAvatar } from "./telegram-entity-avatar";
import { ChannelEconomicsEditor } from "./channel-economics-editor";
import { ChannelPresentationSettingsModal } from "./channel-presentation-settings-modal";
import {
  getChannelSettingsCompletion,
  getOverallChannelSettingsCompletion,
  type ChannelSettingsCompletionStatus,
} from "./channel-settings-completion";
import {
  buildChannelSettingsPayload,
  channelSettingsDraftIsInvalid,
  createChannelSettingsDraft,
  type ChannelSettingsDraft,
} from "./channel-settings-draft";
import { ChannelSystemBotAccessModal } from "./channel-system-bot-access-modal";
import { useAppToast } from "@/providers/toast-provider";
import { featureModalIcon } from "@/components/ui/feature-modal-icons";
import { ChannelSourcesSettings } from "./channel-sources-settings";
import {
  ChannelPublicationScheduleSettings,
  type ChannelPublicationScheduleDraft,
} from "./channel-publication-schedule-settings";

type SettingsTab =
  | "appearance"
  | "economics"
  | "seed"
  | "bot"
  | "sources"
  | "schedule";

const tabs = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "economics", label: "Economics", icon: ChartNoAxesCombined },
  { id: "schedule", label: "Schedule", icon: CalendarClock },
  { id: "seed", label: "Seed", icon: Sprout },
  { id: "bot", label: "Bot", icon: Bot },
  { id: "sources", label: "Sources", icon: Cable },
] as const;

function CompletionIcon({
  status,
}: {
  status: ChannelSettingsCompletionStatus;
}) {
  if (status === "complete")
    return (
      <CircleCheck size={15} className="text-emerald-400" aria-hidden="true" />
    );
  if (status === "partial")
    return (
      <CircleDotDashed
        size={15}
        className="text-amber-300"
        aria-hidden="true"
      />
    );
  return <Circle size={15} className="text-neutral-600" aria-hidden="true" />;
}

export function ChannelSettingsModal({
  channel,
  currencySettings,
  canManageBot = true,
  initialTab = "appearance",
  onClose,
}: {
  channel: TelegramChannel;
  currencySettings?: CurrencySettings | null;
  canManageBot?: boolean;
  initialTab?: SettingsTab;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [draft, setDraft] = useState(() => createChannelSettingsDraft(channel));
  const [registerPending, setRegisterPending] = useState(false);
  const [publicationScheduleDraft, setPublicationScheduleDraft] =
    useState<ChannelPublicationScheduleDraft | null>(null);
  const queryClient = useQueryClient();
  const { startOperation } = useAppToast();
  const scheduleAssignment = useQuery({
    queryKey: telegramPublicationScheduleKeys.assignment(channel.id),
    queryFn: () => telegramPublicationSchedulesApi.getAssignment(channel.id),
  });
  const visibleTabs = tabs.filter((tab) => tab.id !== "bot" || canManageBot);
  const completion = getChannelSettingsCompletion(channel, draft);
  const completionFor = (
    tab: (typeof tabs)[number],
  ): ChannelSettingsCompletionStatus =>
    tab.id === "schedule"
      ? scheduleAssignment.data
        ? "complete"
        : scheduleAssignment.isLoading
          ? "partial"
          : "empty"
      : completion[tab.id];
  const completionPercent = getOverallChannelSettingsCompletion(channel, {
    draft,
    includeBot: canManageBot,
    scheduleStatus: completionFor(tabs[2]),
  }).percent;
  const updateDraft = (patch: Partial<ChannelSettingsDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const save = useMutation({
    mutationFn: async () => {
      const operation = startOperation({
        id: `channel-settings:${channel.id}`,
        title: "Saving channel settings",
        message: "Applying channel settings…",
      });
      try {
        const channelUpdate = telegramChannelsApi.updateQuiet(
          channel.id,
          buildChannelSettingsPayload(draft),
        );
        const scheduleUpdate = publicationScheduleDraft?.scheduleId
          ? telegramPublicationSchedulesApi.assignQuiet(channel.id, {
              scheduleId: publicationScheduleDraft.scheduleId,
              selectionMode: "SUBSET",
              selectedSlotIds: publicationScheduleDraft.selectedSlotIds,
            })
          : Promise.resolve(null);
        const [updatedChannel] = await Promise.all([
          channelUpdate,
          scheduleUpdate,
        ]);
        operation.succeed({
          title: "Channel settings saved",
          message: "Your changes were saved successfully.",
        });
        return updatedChannel;
      } catch (error) {
        operation.fail({
          title: "Could not save channel settings",
          message: "Check the settings and try again.",
        });
        throw error;
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: telegramChannelKeys.lists(),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramChannelKeys.detail(channel.id),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramChannelKeys.trafficAttribution(channel.id),
        }),
        queryClient.invalidateQueries({
          queryKey: telegramPublicationScheduleKeys.assignment(channel.id),
        }),
      ]);
    },
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Channel settings"
      titleIcon={featureModalIcon("channel-settings")}
      size="xl"
    >
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-950/50 p-3">
        <TelegramEntityAvatar
          imageUrl={channel.photoUrl}
          kind="channel"
          size="md"
          alt={channel.title}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-white">{channel.title}</p>
          <p className="truncate text-sm text-neutral-400">
            {channel.username
              ? `@${channel.username.replace(/^@/, "")}`
              : "Telegram channel"}
          </p>
        </div>
        <div className="w-28 shrink-0" title="Overall channel setup">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-neutral-500">Setup</span>
            <span className="font-medium text-neutral-300">
              {completionPercent}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full rounded-full bg-blue-500 transition-[width]"
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </div>
      </div>
      <div
        className="mb-5 flex gap-1 overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950/40 p-1"
        role="tablist"
        aria-label="Channel settings sections"
      >
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const status = completionFor(tab);
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              aria-label={tab.label}
              className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white"
                  : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
              }`}
            >
              <Icon size={16} aria-hidden="true" />
              {tab.label}
              <span
                className="ml-0.5"
                title={
                  status === "complete"
                    ? "Fully configured"
                    : status === "partial"
                      ? "Partially configured"
                      : "Not configured"
                }
              >
                <CompletionIcon status={status} />
              </span>
            </button>
          );
        })}
      </div>
      {activeTab === "appearance" ? (
        <ChannelPresentationSettingsModal
          channel={channel}
          onClose={onClose}
          draft={draft}
          onDraftChange={updateDraft}
          onRegisterPendingChange={setRegisterPending}
          embedded
        />
      ) : null}
      {activeTab === "economics" ? (
        <ChannelEconomicsEditor
          channel={channel}
          currencySettings={currencySettings}
          onClose={onClose}
          draft={draft}
          onDraftChange={updateDraft}
          embedded
        />
      ) : null}
      {activeTab === "seed" ? (
        <ChannelSeedSettings draft={draft} onDraftChange={updateDraft} />
      ) : null}
      {activeTab === "bot" && canManageBot ? (
        <ChannelSystemBotAccessModal
          channel={channel}
          onClose={onClose}
          embedded
        />
      ) : null}
      {activeTab === "sources" ? (
        <ChannelSourcesSettings
          channel={channel}
          autoSyncEnabled={draft.autoSyncEnabled}
          postSyncLimit={draft.postSyncLimit}
          onAutoSyncChange={(autoSyncEnabled) =>
            updateDraft({ autoSyncEnabled })
          }
          onPostSyncLimitChange={(postSyncLimit) =>
            updateDraft({ postSyncLimit })
          }
        />
      ) : null}
      {activeTab === "schedule" ? (
        <ChannelPublicationScheduleSettings
          channelId={channel.id}
          value={publicationScheduleDraft}
          onChange={setPublicationScheduleDraft}
        />
      ) : null}
      <div className="mt-5 flex justify-end gap-2 border-t border-neutral-800 pt-4">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={
            save.isPending ||
            registerPending ||
            (activeTab === "schedule" &&
              publicationScheduleDraft !== null &&
              (!publicationScheduleDraft.scheduleId ||
                publicationScheduleDraft.selectedSlotIds.length === 0)) ||
            channelSettingsDraftIsInvalid(draft)
          }
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Modal>
  );
}

function ChannelSeedSettings({
  draft,
  onDraftChange,
}: {
  draft: ChannelSettingsDraft;
  onDraftChange: (patch: Partial<ChannelSettingsDraft>) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-400">
        Values subtracted from subscriber and post metrics before analytics are
        calculated.
      </p>
      <ToggleRow
        checked={draft.seedDisabled}
        onChange={(seedDisabled) => onDraftChange({ seedDisabled })}
        label="No seed"
        description="This channel has no seed audience or artificial starting activity."
      />
      {!draft.seedDisabled ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <SeedField
            label="Own / seed subscribers"
            value={draft.seedSubscribersCount}
            onChange={(seedSubscribersCount) =>
              onDraftChange({ seedSubscribersCount })
            }
          />
          <SeedField
            label="Known fake subscribers"
            value={draft.knownFakeSubscribersCount}
            onChange={(knownFakeSubscribersCount) =>
              onDraftChange({ knownFakeSubscribersCount })
            }
          />
          <SeedField
            label="Own views per post"
            value={draft.ownViewsPerPost}
            onChange={(ownViewsPerPost) => onDraftChange({ ownViewsPerPost })}
          />
          <SeedField
            label="Own reactions per post"
            value={draft.ownReactionsPerPost}
            onChange={(ownReactionsPerPost) =>
              onDraftChange({ ownReactionsPerPost })
            }
          />
        </div>
      ) : (
        <p className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-3 text-sm text-emerald-200">
          Seed adjustments will be saved as zero and this section will be marked
          as configured.
        </p>
      )}
    </div>
  );
}

function SeedField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormField label={label}>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </FormField>
  );
}

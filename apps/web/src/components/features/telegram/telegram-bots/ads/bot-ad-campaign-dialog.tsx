"use client";

import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BOT_AD_PLACEMENT_LIMIT,
  type BotAdChannelOption,
  type CreateBotAdPlacements,
  type ResolvedEmoji,
} from "@telegram-system/shared";
import { IconPicker } from "@/components/icons/icon-picker";
import { CommonAdSlotOptions } from "@/components/features/growth/common-ad-slot-options";
import { ModalDraftPicker } from "@/components/ui/modal-draft-picker";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Button,
  CustomSelect,
  DateInput,
  FormError,
  FormField,
  Input,
  Modal,
  MultiSelect,
  TimeInput,
  localDateTimeInputToIso,
} from "@/components/ui/primitives";
import { useWorkspaceModalDrafts } from "@/hooks/use-workspace-modal-drafts";
import { telegramChannelNetworksApi } from "@/lib/api";
import { networkKeys } from "@/lib/query-keys";
import type { BotAdPlacementSeed } from "./bot-ad-placement-dialogs";

type CampaignDraft = {
  title: string;
  promoId: string;
  channelIds: string[];
  networkIds: string[];
  mode: "channels" | "networks";
  date: string;
  time: string;
  iconId: string | null;
  icon: ResolvedEmoji | null;
};

function initialDraft(seed: BotAdPlacementSeed): CampaignDraft {
  return {
    title: seed.title ?? seed.promo?.title ?? "",
    promoId: seed.promo?.id ?? "",
    channelIds: seed.channelId ? [seed.channelId] : [],
    networkIds: [],
    mode: "channels",
    date: "",
    time: "",
    iconId: null,
    icon: null,
  };
}

function normalizeCampaignDraft(
  value: unknown,
  fallback: CampaignDraft,
): CampaignDraft {
  if (!value || typeof value !== "object") return fallback;
  const draft = value as Partial<CampaignDraft>;
  const ids = (items: unknown) =>
    Array.isArray(items)
      ? items.filter((id): id is string => typeof id === "string")
      : [];
  return {
    title: typeof draft.title === "string" ? draft.title : fallback.title,
    promoId:
      typeof draft.promoId === "string" ? draft.promoId : fallback.promoId,
    channelIds: ids(draft.channelIds),
    networkIds: ids(draft.networkIds),
    mode: draft.mode === "networks" ? "networks" : "channels",
    date: typeof draft.date === "string" ? draft.date : "",
    time: typeof draft.time === "string" ? draft.time : "",
    iconId: typeof draft.iconId === "string" ? draft.iconId : null,
    icon: draft.icon && typeof draft.icon === "object" ? draft.icon : null,
  };
}

export function BotAdCampaignDialog({
  seed,
  promos,
  channels,
  pending,
  loading,
  failed,
  error,
  onClose,
  onSave,
  workspaceId,
  botScope,
}: {
  seed: BotAdPlacementSeed;
  promos: { id: string; title: string }[];
  channels: BotAdChannelOption[];
  pending: boolean;
  loading: boolean;
  failed: boolean;
  error?: string;
  onClose: () => void;
  onSave: (input: CreateBotAdPlacements) => Promise<void>;
  workspaceId: string;
  botScope: string;
}) {
  const [form, setForm] = useState(() => initialDraft(seed));
  const {
    title,
    promoId,
    channelIds,
    networkIds,
    mode,
    date,
    time,
    iconId,
    icon,
  } = form;
  const patch = (value: Partial<CampaignDraft>) =>
    setForm((current) => ({ ...current, ...value }));
  const initial = useCallback(() => initialDraft(seed), [seed]);
  const normalize = useCallback(
    (value: unknown) => normalizeCampaignDraft(value, initial()),
    [initial],
  );
  const drafts = useWorkspaceModalDrafts<CampaignDraft>({
    namespace: `bot-ads:placement:${botScope}`,
    workspaceId,
    schemaVersion: 1,
    open: true,
    enabled: Boolean(workspaceId),
    value: form,
    createInitialValue: initial,
    normalize,
    onRestore: setForm,
    isMeaningful: (value) =>
      JSON.stringify(value) !== JSON.stringify(initial()),
    previewFor: (value) => ({
      title: value.title.trim() || "Unfinished campaign",
      subtitle: [value.date, value.time].filter(Boolean).join(" "),
      icon: value.icon,
    }),
  });
  const request = useRef<{ signature: string; input: CreateBotAdPlacements }>(
    null,
  );
  const networks = useQuery({
    queryKey: networkKeys.options(),
    queryFn: telegramChannelNetworksApi.listOptions,
    enabled: mode === "networks",
  });
  const eligibleIds = new Set(channels.map(({ id }) => id));
  const eligibleNetworks =
    networks.data?.filter((network) =>
      network.channels.some(({ id }) => eligibleIds.has(id)),
    ) ?? [];
  const targets =
    mode === "channels"
      ? channelIds
      : [
          ...new Set(
            eligibleNetworks
              .filter(({ id }) => networkIds.includes(id))
              .flatMap((network) => network.channels.map(({ id }) => id))
              .filter((id) => eligibleIds.has(id)),
          ),
        ];
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const plannedAt = localDateTimeInputToIso(date, time);
  const [openedAt] = useState(() => Date.now());
  const [invalidTime, setInvalidTime] = useState(false);
  const future = Boolean(plannedAt && Date.parse(plannedAt) > openedAt);
  const tooMany = targets.length > BOT_AD_PLACEMENT_LIMIT;
  const disabled =
    pending ||
    loading ||
    failed ||
    !title.trim() ||
    !promos.some(({ id }) => id === promoId) ||
    !targets.length ||
    tooMany ||
    !future ||
    targets.some((id) => !eligibleIds.has(id)) ||
    (mode === "networks" &&
      networkIds.some(
        (id) => !eligibleNetworks.some((network) => network.id === id),
      ));

  async function submit() {
    if (disabled || !plannedAt) return;
    if (Date.parse(plannedAt) <= Date.now()) {
      setInvalidTime(true);
      return;
    }
    setInvalidTime(false);
    const fields = {
      title: title.trim(),
      promoId,
      plannedAt,
      date,
      iconId: iconId ?? undefined,
      networkIds: mode === "networks" ? networkIds : undefined,
    };
    const signature = JSON.stringify([fields, targets]);
    if (request.current?.signature !== signature) {
      request.current = {
        signature,
        input: {
          ...fields,
          campaignId: crypto.randomUUID(),
          targets: targets.map((channelId) => ({
            channelId,
            id: crypto.randomUUID(),
          })),
        },
      };
    }
    try {
      await onSave(request.current.input);
      drafts.clearCurrentDraft();
      onClose();
    } catch {
      // The mutation reports the error and keeps the draft available to retry.
    }
  }

  function close() {
    if (pending) return;
    drafts.showDraftPicker();
    onClose();
  }

  return (
    <Modal open title="Create placement campaign" size="sm" onClose={close}>
      {drafts.pendingDrafts.length ? (
        <ModalDraftPicker
          drafts={drafts.pendingDrafts}
          onContinue={drafts.continueDraft}
          onDelete={drafts.deleteDraft}
          onCreateNew={drafts.createNewDraft}
        />
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="flex items-end gap-2">
            <IconPicker
              compact
              iconId={iconId}
              icon={icon}
              onChange={(id, presentation) =>
                patch({ iconId: id, icon: presentation ?? null })
              }
              buttonLabel="Campaign emoji"
              iconOnly
            />
            <div className="min-w-0 flex-1">
              <FormField label="Campaign name" required>
                <Input
                  aria-label="Campaign name"
                  value={title}
                  required
                  maxLength={160}
                  disabled={pending}
                  onChange={(event) => patch({ title: event.target.value })}
                />
              </FormField>
            </div>
          </div>
          <FormField label="Promo" required>
            <CustomSelect
              ariaLabel="Promo"
              value={promoId}
              onChange={(id) => patch({ promoId: id })}
              disabled={pending || loading}
              placeholder="Select an active promo"
              options={promos.map(({ id, title }) => ({
                value: id,
                label: title,
              }))}
            />
          </FormField>
          <div className="space-y-2">
            <SegmentedControl
              ariaLabel="Publishing targets"
              value={mode}
              onChange={(mode) => patch({ mode })}
              disabled={pending}
              options={[
                { value: "channels", label: "Channels" },
                { value: "networks", label: "Networks" },
              ]}
            />
            {mode === "channels" ? (
              <FormField label="Publishing channels" required>
                <MultiSelect
                  ariaLabel="Publishing channels"
                  value={channelIds}
                  onChange={(channelIds) => patch({ channelIds })}
                  disabled={pending || loading}
                  placeholder="Select channels"
                  options={channels.map(
                    ({ id, title, isTest, avatarPresentation }) => ({
                      value: id,
                      label: title,
                      badge: isTest ? "Test" : undefined,
                      iconPresentation: avatarPresentation ?? undefined,
                    }),
                  )}
                />
              </FormField>
            ) : (
              <FormField label="Publishing networks" required>
                <MultiSelect
                  ariaLabel="Publishing networks"
                  value={networkIds}
                  onChange={(networkIds) => patch({ networkIds })}
                  disabled={pending || networks.isPending}
                  placeholder="Select networks"
                  options={eligibleNetworks.map(
                    ({ id, name, iconPresentation }) => ({
                      value: id,
                      label: name,
                      iconPresentation: iconPresentation ?? undefined,
                    }),
                  )}
                />
                {networks.isError && (
                  <FormError message="Could not load publishing networks." />
                )}
              </FormField>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Date" required>
              <DateInput
                aria-label="Date"
                value={date}
                disabled={pending}
                onChange={(event) => {
                  setInvalidTime(false);
                  patch({ date: event.target.value });
                }}
              />
            </FormField>
            <FormField label={`Time (${timezone})`} required>
              <TimeInput
                aria-label="Time"
                value={time}
                disabled={pending}
                onChange={(event) => {
                  setInvalidTime(false);
                  patch({ time: event.target.value });
                }}
              />
            </FormField>
          </div>
          <fieldset disabled={pending}>
            <CommonAdSlotOptions
              displayTimezone={timezone}
              channelIds={tooMany ? [] : targets}
              date={date}
              selectedTime={time}
              onSelect={(time) => {
                setInvalidTime(false);
                patch({ time });
              }}
            />
          </fieldset>
          <p className="text-sm text-neutral-400">
            Each channel gets a unique tracking link and a draft for the chosen
            time.
          </p>
          {failed && <FormError message="Could not load promos or channels." />}
          {tooMany && (
            <FormError
              message={`Select up to ${BOT_AD_PLACEMENT_LIMIT} channels.`}
            />
          )}
          {plannedAt && (!future || invalidTime) && (
            <FormError message="Choose a future date and time." />
          )}
          {error && <FormError message={error} />}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={close}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={drafts.showDraftPicker}
              disabled={
                pending ||
                !drafts.currentDraft ||
                JSON.stringify(form) === JSON.stringify(initial())
              }
            >
              Save as draft
            </Button>
            <Button type="submit" disabled={disabled}>
              {pending ? "Creating…" : "Create campaign"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

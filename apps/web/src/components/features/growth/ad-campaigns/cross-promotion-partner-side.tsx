"use client";

import { Bot, Send } from "lucide-react";
import type {
  CrossPromotionTargetInput,
  TelegramAdProduct,
  TelegramAdvertiser,
  TelegramSystemBotPostDraft,
} from "@telegram-system/shared";
import type { Promo, TelegramChannel, TelegramInviteLink } from "@/lib/api";
import { Button, FormField, MultiSelect } from "@/components/ui/primitives";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { MutualPromotionPostComposer } from "./mutual-promotion/mutual-promotion-post-composer";
import { CrossPromotionTargetEditor } from "./cross-promotion-target-editor";
import { CrmClientField } from "../crm/crm-client-field";
import {
  CrossPromotionPlacementSettings,
  type CrossPromotionPlacementSettingsValue,
} from "./cross-promotion-placement-settings";

type FlowStatus = "idle" | "working" | "waiting" | "done";

export function CrossPromotionPartnerSide({
  channels,
  partnerChannels,
  ownChannels,
  partnerIds,
  onPartnerIdsChange,
  partnerAdvertiserId,
  partnerContact,
  onPartnerContactChange,
  onPartnerTelegramChange,
  onPartnerAdvertiserChange,
  onSearchAdvertisers,
  importingChannel,
  onImportChannel,
  productsByChannelId,
  settings,
  defaultDate,
  onDefaultDateChange,
  defaultTime,
  onSettingsChange,
  basicsReady,
  targetIds,
  targets,
  onTargetIdsChange,
  onTargetsChange,
  onResolved,
  outboundMode,
  onOutboundModeChange,
  outboundPost,
  onOutboundPostChange,
  botConnected,
  importStatus,
  sendStatus,
  onImportPost,
  onSendPost,
  promoReady,
}: {
  channels: TelegramChannel[];
  partnerChannels: TelegramChannel[];
  ownChannels: TelegramChannel[];
  partnerIds: string[];
  onPartnerIdsChange: (ids: string[]) => void;
  partnerAdvertiserId: string | null;
  partnerContact: string;
  onPartnerContactChange: (value: string) => void;
  onPartnerTelegramChange: (value: string) => void;
  onPartnerAdvertiserChange: (advertiser: TelegramAdvertiser | null) => void;
  onSearchAdvertisers: (query: string) => Promise<TelegramAdvertiser[]>;
  importingChannel: boolean;
  onImportChannel: (input: string) => void | Promise<void>;
  productsByChannelId: Record<string, TelegramAdProduct[]>;
  settings: CrossPromotionPlacementSettingsValue;
  defaultDate: string;
  onDefaultDateChange: (date: string) => void;
  defaultTime: string;
  onSettingsChange: (value: CrossPromotionPlacementSettingsValue) => void;
  basicsReady: boolean;
  targetIds: string[];
  targets: CrossPromotionTargetInput[];
  onTargetIdsChange: (ids: string[]) => void;
  onTargetsChange: (targets: CrossPromotionTargetInput[]) => void;
  onResolved: (
    channelId: string,
    value: { promo?: Promo; inviteLink?: TelegramInviteLink },
  ) => void;
  outboundMode: "PROMO" | "CUSTOM";
  onOutboundModeChange: (value: "PROMO" | "CUSTOM") => void;
  outboundPost: TelegramSystemBotPostDraft;
  onOutboundPostChange: (post: TelegramSystemBotPostDraft) => void;
  botConnected: boolean;
  importStatus: FlowStatus;
  sendStatus: FlowStatus;
  onImportPost: () => void;
  onSendPost: () => void;
  promoReady: boolean;
}) {
  const channelOptions = (items: TelegramChannel[]) =>
    items.map((channel) => ({
      value: channel.id,
      label: channel.username
        ? `${channel.title} · @${channel.username}`
        : channel.title,
      selectedLabel: channel.title,
      iconUrl: channel.photoUrl,
      iconFallback: channel.title,
    }));

  return (
    <section className="space-y-4 rounded-xl border border-emerald-900/70 bg-emerald-950/10 p-4">
      <div>
        <h3 className="font-semibold text-white">Partner side</h3>
        <p className="text-xs text-neutral-400">
          Where the partner publishes my promo and which invite link tracks the
          exchange.
        </p>
      </div>
      <div className="grid items-end gap-3 md:grid-cols-[minmax(280px,.8fr)_minmax(0,1.2fr)]">
        <CrmClientField
          contact={partnerContact}
          selectedAdvertiserId={partnerAdvertiserId}
          onContactChange={onPartnerContactChange}
          onTelegramChange={onPartnerTelegramChange}
          onSelect={onPartnerAdvertiserChange}
          onSearchAdvertisers={onSearchAdvertisers}
        />
        <FormField label="Partner channels" required>
          <MultiSelect
            value={partnerIds}
            onChange={onPartnerIdsChange}
            options={channelOptions(partnerChannels)}
            placeholder="Where the partner publishes my promo"
            searchPlaceholder="Search or paste a Telegram channel link"
            canCreateOption={(input) => Boolean(input.trim())}
            createOptionLabel={() => "Import and select pasted channels"}
            onCreateOption={onImportChannel}
            creatingOption={importingChannel}
          />
        </FormField>
      </div>
      {partnerIds.length ? (
        <CrossPromotionPlacementSettings
          title="Formats in partner channels"
          description="Set the planned publication date, time, and format for every partner channel."
          channelIds={partnerIds}
          channels={channels}
          productsByChannelId={productsByChannelId}
          value={settings}
          defaultDate={defaultDate}
          defaultTime={defaultTime}
          onDefaultDateChange={onDefaultDateChange}
          onChange={onSettingsChange}
        />
      ) : null}
      {basicsReady ? (
        <>
          <div className="grid items-end gap-3 md:grid-cols-[minmax(260px,.8fr)_minmax(0,1.2fr)]">
            <FormField label="My promo source" required>
              <div className="flex h-[42px] items-center rounded-lg border border-neutral-700 bg-neutral-950 px-2">
                <SegmentedControl
                  value={outboundMode}
                  onChange={onOutboundModeChange}
                  ariaLabel="My promo source"
                  options={[
                    { value: "PROMO", label: "Saved promo" },
                    { value: "CUSTOM", label: "Custom post" },
                  ]}
                />
              </div>
            </FormField>
            <FormField label="My channels being promoted" required>
              <MultiSelect
                value={targetIds}
                onChange={onTargetIdsChange}
                options={channelOptions(ownChannels)}
                placeholder="Select the channel promoted by my promo"
                searchPlaceholder="Search your channels"
              />
            </FormField>
          </div>
          <div className="grid gap-3">
            {targets.map((target) => {
              const channel = channels.find(
                (item) => item.id === target.telegramChannelId,
              );
              return channel ? (
                <CrossPromotionTargetEditor
                  key={channel.id}
                  channel={channel}
                  value={target}
                  showPromo={outboundMode === "PROMO"}
                  onChange={(next) =>
                    onTargetsChange(
                      targets.map((item) =>
                        item.telegramChannelId === channel.id ? next : item,
                      ),
                    )
                  }
                  onResolved={(value) => onResolved(channel.id, value)}
                />
              ) : null;
            })}
          </div>
          {outboundMode === "CUSTOM" ? (
            <section className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-950/55 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-semibold text-white">
                    My custom promo
                  </h4>
                  <p className="text-xs text-neutral-500">
                    Forward it through the system bot or compose it here.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={
                    !botConnected ||
                    importStatus === "working" ||
                    importStatus === "waiting"
                  }
                  onClick={onImportPost}
                >
                  <Bot size={15} />{" "}
                  {importStatus === "working"
                    ? "Loading…"
                    : importStatus === "waiting"
                      ? "Waiting for bot…"
                      : importStatus === "done"
                        ? "✅ Imported from bot"
                        : "Import from bot"}
                </Button>
              </div>
              <MutualPromotionPostComposer
                draft={outboundPost}
                channelTitle={
                  channels.find((channel) => channel.id === targetIds[0])
                    ?.title ?? "Promoted channel"
                }
                channelPhotoUrl={
                  channels.find((channel) => channel.id === targetIds[0])
                    ?.photoUrl
                }
                channelId={targetIds[0]}
                onChange={onOutboundPostChange}
              />
            </section>
          ) : null}
          <div className="flex justify-end">
            <Button
              type="button"
              variant="secondary"
              disabled={
                !botConnected || sendStatus === "working" || !promoReady
              }
              onClick={onSendPost}
            >
              <Send size={15} />{" "}
              {sendStatus === "working"
                ? "Sending…"
                : sendStatus === "done"
                  ? "✅ Sent to bot"
                  : "Send my promo to bot"}
            </Button>
          </div>
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-neutral-700 p-3 text-sm text-neutral-500">
          Add a title and choose channels on both sides to configure the promo.
        </p>
      )}
    </section>
  );
}

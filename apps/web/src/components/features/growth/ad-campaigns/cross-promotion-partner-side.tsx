"use client";

import { Bot, ChevronDown, Plus, Send, Trash2 } from "lucide-react";
import type {
  CrossPromotionTargetInput,
  TelegramAdProduct,
  TelegramAdvertiser,
  TelegramSystemBotPostDraft,
} from "@telegram-system/shared";
import type { Promo, TelegramChannel, TelegramInviteLink } from "@/lib/api";
import {
  Button,
  CustomSelect,
  FormField,
  MultiSelect,
} from "@/components/ui/primitives";
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
  expanded,
  onExpandedChange,
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
  targets,
  onTargetsChange,
  onAddTarget,
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
  showValidationErrors = false,
}: {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
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
  targets: CrossPromotionTargetInput[];
  onTargetsChange: (targets: CrossPromotionTargetInput[]) => void;
  onAddTarget?: () => void;
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
  onSendPost: (targetIndex: number) => void;
  promoReady: boolean;
  showValidationErrors?: boolean;
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
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 text-left"
        aria-expanded={expanded}
        onClick={() => onExpandedChange(!expanded)}
      >
        <span>
          <h3 className="font-semibold text-white">Partner side</h3>
          <p className="text-xs text-neutral-400">
            Optional now — add the client and their publication later, when they
            are ready to place your promo.
          </p>
        </span>
        <ChevronDown
          size={18}
          className={`mt-0.5 shrink-0 text-neutral-400 transition-transform ${
            expanded ? "" : "-rotate-90"
          }`}
        />
      </button>
      {expanded ? (
        <>
          <div className="grid items-end gap-3 md:grid-cols-[minmax(280px,.8fr)_minmax(0,1.2fr)]">
            <CrmClientField
              contact={partnerContact}
              selectedAdvertiserId={partnerAdvertiserId}
              onContactChange={onPartnerContactChange}
              onTelegramChange={onPartnerTelegramChange}
              onSelect={onPartnerAdvertiserChange}
              onSearchAdvertisers={onSearchAdvertisers}
            />
            <FormField label="Partner channels (optional)">
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
            formatErrorChannelIds={
              showValidationErrors
                ? partnerIds.filter((channelId) => {
                    const products = productsByChannelId[channelId] ?? [];
                    return (
                      products.length > 0 && !settings.formatIds[channelId]
                    );
                  })
                : []
            }
          />
          <>
            <div className="grid gap-3">
              {targets.map((target, index) => {
                const channel = channels.find(
                  (item) => item.id === target.telegramChannelId,
                );
                if (!channel) return null;
                return (
                  <section
                    key={`${channel.id}-${index}`}
                    className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-950/55 p-3"
                  >
                    <div className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <FormField label="My channel being promoted" required>
                        <CustomSelect
                          value={target.telegramChannelId}
                          onChange={(telegramChannelId) =>
                            onTargetsChange(
                              targets.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      telegramChannelId,
                                      promoId:
                                        outboundMode === "CUSTOM" ? null : "",
                                      inviteLinkId: "",
                                    }
                                  : item,
                              ),
                            )
                          }
                          placeholder="Select my channel"
                          options={channelOptions(ownChannels)}
                        />
                      </FormField>
                      <FormField label="My promo source" required>
                        <div className="flex h-[42px] items-center rounded-lg border border-neutral-700 bg-neutral-950 px-2">
                          <SegmentedControl
                            value={outboundMode}
                            onChange={onOutboundModeChange}
                            ariaLabel={`My promo source for placement ${index + 1}`}
                            options={[
                              { value: "PROMO", label: "Saved promo" },
                              { value: "CUSTOM", label: "Custom post" },
                            ]}
                          />
                        </div>
                      </FormField>
                      {targets.length > 1 ? (
                        <Button
                          type="button"
                          variant="danger"
                          aria-label={`Remove promo placement ${index + 1}`}
                          onClick={() =>
                            onTargetsChange(
                              targets.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            )
                          }
                        >
                          <Trash2 size={16} />
                        </Button>
                      ) : null}
                    </div>
                    <CrossPromotionTargetEditor
                      channel={channel}
                      value={target}
                      showPromo={outboundMode === "PROMO"}
                      showChannelIdentity={false}
                      framed={false}
                      trailing={
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={
                            !botConnected ||
                            sendStatus === "working" ||
                            !target.inviteLinkId ||
                            (outboundMode === "PROMO" && !target.promoId) ||
                            (outboundMode === "CUSTOM" && !promoReady)
                          }
                          onClick={() => onSendPost(index)}
                        >
                          <Send size={15} />{" "}
                          {sendStatus === "working"
                            ? "Sending…"
                            : sendStatus === "done"
                              ? "✅ Sent to bot"
                              : "Send to bot"}
                        </Button>
                      }
                      onChange={(next) =>
                        onTargetsChange(
                          targets.map((item, itemIndex) =>
                            itemIndex === index ? next : item,
                          ),
                        )
                      }
                      onResolved={(value) =>
                        onResolved(`target:${index}`, value)
                      }
                    />
                  </section>
                );
              })}
              <div className="flex">
                <Button type="button" onClick={onAddTarget}>
                  <Plus size={15} /> Add promo placement
                </Button>
              </div>
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
                    channels.find(
                      (channel) => channel.id === targets[0]?.telegramChannelId,
                    )?.title ?? "Promoted channel"
                  }
                  channelPhotoUrl={
                    channels.find(
                      (channel) => channel.id === targets[0]?.telegramChannelId,
                    )?.photoUrl
                  }
                  channelId={targets[0]?.telegramChannelId}
                  onChange={onOutboundPostChange}
                />
              </section>
            ) : null}
          </>
        </>
      ) : null}
    </section>
  );
}

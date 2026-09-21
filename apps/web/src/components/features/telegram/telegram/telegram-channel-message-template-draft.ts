import type { TelegramChannelMessageTemplatePayload } from "@telegram-system/shared";
import { DEFAULT_CHANNEL_MESSAGE_TEMPLATE } from "./telegram-channel-message-template-format";

export const TELEGRAM_MESSAGE_TEMPLATE_DRAFT_NAMESPACE =
  "telegram-channel-message-template:draft";

export const emptyTelegramMessageTemplatePayload =
  (): TelegramChannelMessageTemplatePayload => ({
    title: "",
    iconId: null,
    scopeMode: "CHANNELS",
    networkId: null,
    channelIds: [],
    groupChannels: false,
    channelGroupLabels: {},
    bodyTemplate: DEFAULT_CHANNEL_MESSAGE_TEMPLATE,
    overrideInviteLinks: false,
    inviteLinkOverrides: {},
    excludedProductNames: [],
    priceRounding: "NONE",
    productNameOverrides: {},
    bundleOfferEnabled: false,
    bundleDiscountPercent: 10,
    bundleBasePriceOverrides: {},
  });

export type TelegramChannelMessageTemplateDraftForm = {
  payload: TelegramChannelMessageTemplatePayload;
  savedTemplateId: string | null;
};

export function normalizeTelegramChannelMessageTemplateDraft(
  value: unknown,
  _sourceSchemaVersion: number,
  _index: number,
  envelope?: Record<string, unknown>,
): TelegramChannelMessageTemplateDraftForm | null {
  const candidate = value as Partial<TelegramChannelMessageTemplateDraftForm>;
  const payload = (candidate.payload ??
    value) as Partial<TelegramChannelMessageTemplatePayload>;
  if (
    !Array.isArray(payload.channelIds) ||
    typeof payload.bodyTemplate !== "string"
  )
    return null;
  const savedTemplateId =
    typeof candidate.savedTemplateId === "string"
      ? candidate.savedTemplateId
      : typeof envelope?.savedTemplateId === "string"
        ? envelope.savedTemplateId
        : null;
  // Local drafts are only for templates that have not been saved yet.
  // Reject records produced by the previous edit-autosave behavior.
  if (savedTemplateId) return null;
  return {
    payload: payload as TelegramChannelMessageTemplatePayload,
    savedTemplateId: null,
  };
}

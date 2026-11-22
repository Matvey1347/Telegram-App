import type { CrossPromotionPlanKind, ResolvedEmoji, TelegramAdvertiser } from "@telegram-system/shared";
import { FormField, Input } from "@/components/ui/primitives";
import { IconPicker } from "@/components/icons/icon-picker";
import { CrmClientField } from "../crm/crm-client-field";
import { Folder, Network, Repeat2 } from "lucide-react";
import { useOptionalI18n } from "@/providers/i18n-provider";

export type PromotionKind = CrossPromotionPlanKind | "FOLDER";

const promotionKinds = {
  DIRECT_MUTUAL: { icon: Repeat2, label: "VP", tone: "bg-violet-950/70 text-violet-200" },
  OWN_CHANNELS: { icon: Network, label: "My channels", tone: "bg-sky-950/70 text-sky-200" },
  FOLDER: { icon: Folder, label: "Folder", tone: "bg-amber-950/70 text-amber-200" },
};

export function PromotionTypeBadge({ kind }: { kind: PromotionKind }) {
  const i18n = useOptionalI18n();
  const { icon: Icon, label, tone } = promotionKinds[kind];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}
    >
      <Icon size={12} aria-hidden="true" />
      {(kind === "FOLDER"
        ? i18n?.t("ads.folder_badge")
        : kind === "OWN_CHANNELS"
          ? i18n?.t("ads.section_own")
          : null) ?? label}
    </span>
  );
}

export function CrossPromotionKindChoice({ kind, onSelect }: {
  kind?: PromotionKind;
  onSelect: (kind: PromotionKind) => void;
}) {
  const i18n = useOptionalI18n();
  const options = [
    { kind: "DIRECT_MUTUAL", title: i18n?.t("ads.promotion_mutual_title") ?? "Mutual promotion" },
    { kind: "OWN_CHANNELS", title: i18n?.t("ads.section_own") ?? "My channels" },
    { kind: "FOLDER", title: i18n?.t("ads.folder_badge") ?? "Folder" },
  ] as const;

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {options.map((option) => {
        const Icon = promotionKinds[option.kind].icon;
        return (
          <button
            key={option.kind}
            type="button"
            onClick={() => onSelect(option.kind)}
            aria-pressed={kind === option.kind}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${kind === option.kind ? "border-blue-500 bg-blue-950/40 text-blue-200" : "border-neutral-800 bg-neutral-950/50 text-neutral-200 hover:border-neutral-600 hover:bg-neutral-800"}`}
          >
            <Icon size={16} aria-hidden="true" />
            {option.title}
          </button>
        );
      })}
    </div>
  );
}

export function CrossPromotionIdentityStep({
  iconId,
  iconPresentation,
  title,
  partnerContact,
  partnerTelegram,
  partnerAdvertiserId,
  selectedClient,
  kind,
  onIconChange,
  onTitleChange,
  onContactChange,
  onTelegramChange,
  onAdvertiserChange,
  onSearchAdvertisers,
}: {
  iconId: string | null;
  iconPresentation: ResolvedEmoji | null;
  title: string;
  partnerContact: string;
  partnerTelegram: string;
  partnerAdvertiserId: string | null;
  selectedClient: {
    id: string;
    displayName: string;
    telegramUsername?: string | null;
    photoUrl?: string | null;
  } | null;
  kind: CrossPromotionPlanKind;
  onIconChange: (iconId: string | null, presentation: ResolvedEmoji | null) => void;
  onTitleChange: (title: string) => void;
  onContactChange: (value: string) => void;
  onTelegramChange: (value: string) => void;
  onAdvertiserChange: (advertiser: TelegramAdvertiser | null) => void;
  onSearchAdvertisers: (query: string) => Promise<TelegramAdvertiser[]>;
}) {
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-2 sm:gap-3">
        <FormField label="Emoji">
          <IconPicker
            compact
            iconId={iconId}
            icon={iconPresentation}
            onChange={(value, presentation) => onIconChange(value, presentation ?? null)}
            buttonLabel="Add emoji"
            iconOnly
          />
        </FormField>
        <FormField label="Promotion title" required>
          <Input
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Mentor ↔ Partner channel"
          />
        </FormField>
      </div>
      {kind === "DIRECT_MUTUAL" ? (
        <>
          <CrmClientField
            contact={partnerContact}
            selectedAdvertiserId={partnerAdvertiserId}
            selectedClient={selectedClient}
            onContactChange={onContactChange}
            onTelegramChange={onTelegramChange}
            onSelect={onAdvertiserChange}
            onSearchAdvertisers={onSearchAdvertisers}
          />
          {partnerTelegram && partnerTelegram !== partnerContact ? (
            <p className="text-xs text-neutral-500">Telegram: {partnerTelegram}</p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

import type {
  CrossPromotionPlanKind,
  ResolvedEmoji,
  TelegramAdvertiser,
} from "@telegram-system/shared";
import { Button, FormField, Input } from "@/components/ui/primitives";
import { IconPicker } from "@/components/icons/icon-picker";
import { CrmClientField } from "../crm/crm-client-field";
import { Folder, Network, Repeat2 } from "lucide-react";
import { useOptionalI18n } from "@/providers/i18n-provider";

export function CrossPromotionKindChoice({
  kind,
  onChange,
  onFolderSelect,
}: {
  kind: CrossPromotionPlanKind;
  onChange: (kind: CrossPromotionPlanKind) => void;
  onFolderSelect?: () => void;
}) {
  const i18n = useOptionalI18n();
  const options = [
    {
      kind: "DIRECT_MUTUAL" as const,
      icon: Repeat2,
      title: i18n?.t("ads.promotion_mutual_title") ?? "Mutual promotion",
      description: i18n?.t("ads.promotion_mutual_help") ?? "Exchange promotion with another channel or partner.",
    },
    {
      kind: "OWN_CHANNELS" as const,
      icon: Network,
      title: i18n?.t("ads.promotion_own_title") ?? "Promote my channels",
      description: i18n?.t("ads.promotion_own_help") ?? "Promote your channels across your own network.",
    },
    {
      kind: "FOLDER" as const,
      icon: Folder,
      title: i18n?.t("ads.promotion_folder_title") ?? "Folder promotion",
      description: i18n?.t("ads.promotion_folder_help") ?? "Coordinate posts across a group of channels.",
    },
  ];
  return (
    <div role="radiogroup" aria-label={i18n?.t("ads.promotion_type") ?? "Promotion type"} className="grid gap-2 sm:grid-cols-3">
      {options.map((option) => {
        const Icon = option.icon;
        const selected = kind === option.kind;
        return (
          <button
            key={option.kind}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => option.kind === "FOLDER" ? onFolderSelect?.() : onChange(option.kind)}
            className={`flex min-w-0 items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${selected ? "border-blue-500 bg-blue-950/35" : "border-neutral-800 bg-neutral-950/50 hover:border-neutral-600"}`}
          >
            <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${selected ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-300"}`}><Icon size={18} /></span>
            <span className="min-w-0">
              <span className="block font-semibold text-white">{option.title}</span>
              <span className="mt-0.5 block text-sm text-neutral-400">{option.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function CrossPromotionCreateSteps({
  kind,
  activeStep,
  onChange,
}: {
  kind: CrossPromotionPlanKind;
  activeStep: number;
  onChange: (step: number) => void;
}) {
  const labels =
    kind === "DIRECT_MUTUAL"
      ? ["Participants", "My side", "Partner side", "Review"]
      : ["Campaign", "My channels", "Placements", "Review"];
  return (
    <nav aria-label="Promotion setup steps" className="grid grid-cols-4 gap-2">
      {labels.map((label, index) => (
        <button
          key={label}
          type="button"
          aria-current={activeStep === index ? "step" : undefined}
          onClick={() => onChange(index)}
          className={`rounded-lg border px-2 py-2 text-xs transition sm:px-3 sm:text-sm ${activeStep === index ? "border-blue-500 bg-blue-950/40 text-blue-200" : "border-neutral-800 text-neutral-500 hover:border-neutral-600 hover:text-neutral-200"}`}
        >
          <span className="mr-1.5 text-neutral-500">{index + 1}</span>
          {label}
        </button>
      ))}
    </nav>
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
  onIconChange: (
    iconId: string | null,
    presentation: ResolvedEmoji | null,
  ) => void;
  onTitleChange: (title: string) => void;
  onContactChange: (value: string) => void;
  onTelegramChange: (value: string) => void;
  onAdvertiserChange: (advertiser: TelegramAdvertiser | null) => void;
  onSearchAdvertisers: (query: string) => Promise<TelegramAdvertiser[]>;
}) {
  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)]">
        <FormField label="Emoji">
          <IconPicker
            compact
            iconId={iconId}
            icon={iconPresentation}
            onChange={(value, presentation) =>
              onIconChange(value, presentation ?? null)
            }
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
          <p className="text-xs text-neutral-500">
            The partner is optional and can be added after you save the
            campaign.
            {partnerTelegram && partnerTelegram !== partnerContact
              ? ` Telegram: ${partnerTelegram}`
              : ""}
          </p>
        </>
      ) : null}
    </section>
  );
}

export function CrossPromotionCreateNavigation({
  activeStep,
  onChange,
}: {
  activeStep: number;
  onChange: (step: number) => void;
}) {
  if (activeStep >= 3) return null;
  return (
    <div className="flex justify-between gap-2 border-t border-neutral-800 pt-4">
      <Button
        type="button"
        variant="secondary"
        disabled={activeStep === 0}
        onClick={() => onChange(Math.max(0, activeStep - 1))}
      >
        Back
      </Button>
      <Button
        type="button"
        onClick={() => onChange(Math.min(3, activeStep + 1))}
      >
        Continue
      </Button>
    </div>
  );
}

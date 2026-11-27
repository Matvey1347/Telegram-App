"use client";

import { useQuery } from "@tanstack/react-query";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { CustomSelect } from "@/components/ui/primitives";
import { promosApi, type Promo } from "@/lib/api";
import { useAppShellWorkspace } from "@/providers/app-shell-workspace";
import { useOptionalI18n } from "@/providers/i18n-provider";
import { CampaignMultiValueSelect } from "./campaign-multi-value-select";

export type PromoChoice = Pick<Promo, "id" | "title"> &
  Partial<Pick<Promo, "iconPresentation" | "archivedAt" | "status" | "text">>;

const isArchived = (promo: PromoChoice) =>
  Boolean(promo.archivedAt || promo.status === "archived");

export function usePromoChoices(channelId: string, enabled: boolean) {
  const workspaceId = useAppShellWorkspace()?.workspaceId;
  return useQuery({
    queryKey: ["promos", "picker", workspaceId, channelId],
    enabled: enabled && Boolean(channelId),
    staleTime: 30_000,
    queryFn: async () => {
      const pages = await Promise.all(
        [false, true].map((archived) =>
          promosApi.listPage({ page: 1, pageSize: 100, telegramChannelId: channelId, archived }),
        ),
      );
      const remaining = await Promise.all(pages.flatMap(({ pagination }, index) =>
        Array.from({ length: Math.max(0, (pagination?.totalPages ?? 1) - 1) }, (_, page) =>
          promosApi.listPage({ page: page + 2, pageSize: 100, telegramChannelId: channelId, archived: index === 1 }),
        ),
      ));
      return [...pages, ...remaining].flatMap(({ items }) => items);
    },
  });
}

type PickerSelection =
  | { multiple: true; value: string[]; onChange: (ids: string[]) => void }
  | { multiple?: false; value: string; onChange: (id: string) => void };

export function PromoPicker({
  promos,
  placeholder,
  disabled,
  ariaLabel,
  ...selection
}: { promos: PromoChoice[]; placeholder: string; disabled?: boolean; ariaLabel?: string } & PickerSelection) {
  const activeLabel = useOptionalI18n()?.t("ads.status_active") ?? "Active";
  const options = [...new Map(promos.map((promo) => [promo.id, promo])).values()]
    .sort((a, b) => Number(isArchived(a)) - Number(isArchived(b)))
    .map((promo) => ({
      value: promo.id,
      label: promo.title,
      searchText: promo.text,
      icon: <IconAvatar icon={promo.iconPresentation} label={promo.title} size="xs" className="shrink-0" />,
      labelContent: (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate">{promo.title}</span>
          {!isArchived(promo) && (
            <span className="shrink-0 rounded bg-emerald-950 px-1.5 text-[10px] text-emerald-200">{activeLabel}</span>
          )}
        </span>
      ),
    }));

  return selection.multiple
    ? <CampaignMultiValueSelect value={selection.value} onChange={selection.onChange} options={options} placeholder={placeholder} />
    : <CustomSelect disabled={disabled} ariaLabel={ariaLabel} value={selection.value} onChange={selection.onChange} options={options} placeholder={placeholder} />;
}

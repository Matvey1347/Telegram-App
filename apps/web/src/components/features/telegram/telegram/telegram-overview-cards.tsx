"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CurrencySettings,
  ExchangeRate,
  TelegramChannelNetwork,
} from "@/lib/api";
import { telegramChannelNetworksApi } from "@/lib/api";
import { MasonryGrid } from "@/components/ui/primitives";
import { useAppToast } from "@/providers/toast-provider";
import { networkKeys } from "@/lib/query-keys";
import { ChannelPreview } from "./channel-preview";
import {
  TelegramCardActionsMenu,
  TelegramCardMenuAction,
} from "./telegram-card-actions-menu";
import { TelegramNetworkCard } from "./telegram-network-card";

type PersonCard = {
  id: string;
  selectionId?: string;
  title: string;
  username?: string;
  contactInfo?: string;
  notes?: string;
  imageUrl?: string;
};

const cardClass =
  "rounded-xl border border-neutral-800/80 bg-neutral-900/55 p-4 text-sm text-neutral-300";

export function TelegramNetworkCards({
  networks,
  moneySettings,
  onEdit,
  onDelete,
}: {
  networks: TelegramChannelNetwork[];
  moneySettings?: CurrencySettings | null;
  rates?: ExchangeRate[];
  onEdit: (network: TelegramChannelNetwork) => void;
  onDelete: (network: TelegramChannelNetwork) => void;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const [pickerGeneration, setPickerGeneration] = useState<
    Record<string, number>
  >({});
  const updateIcon = useMutation({
    mutationFn: ({
      network,
      iconId,
    }: {
      network: TelegramChannelNetwork;
      iconId: string | null;
    }) => telegramChannelNetworksApi.update(network.id, { iconId }),
    onSuccess: (updated) => {
      queryClient.setQueryData<TelegramChannelNetwork[]>(
        networkKeys.list(),
        (current = []) =>
          current.map((network) =>
            network.id === updated.id ? updated : network,
          ),
      );
      queryClient.setQueryData(networkKeys.detail(updated.id), updated);
      pushToast("Network emoji updated.", "success");
    },
    onError: (_error, variables) => {
      setPickerGeneration((current) => ({
        ...current,
        [variables.network.id]: (current[variables.network.id] || 0) + 1,
      }));
      pushToast("Failed to update network emoji.", "error");
    },
  });

  return (
    <MasonryGrid
      className="!columns-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
      itemClassName="mb-0"
    >
      {networks.map((network) => {
        return (
          <TelegramNetworkCard
            key={network.id}
            network={network}
            moneySettings={moneySettings}
            iconPickerKey={`${network.id}:${network.iconId || "none"}:${pickerGeneration[network.id] || 0}`}
            iconUpdating={
              updateIcon.isPending &&
              updateIcon.variables?.network.id === network.id
            }
            onIconChange={(iconId) => updateIcon.mutate({ network, iconId })}
            onEdit={() => onEdit(network)}
            onDelete={() => onDelete(network)}
          />
        );
      })}
    </MasonryGrid>
  );
}

export function TelegramPeopleCards({
  people,
  onDelete,
}: {
  people: PersonCard[];
  onDelete: (person: PersonCard) => void;
}) {
  return (
    <MasonryGrid
      className="!columns-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
      itemClassName="mb-0"
    >
      {people.map((person) => {
        const username = String(person.username || "").replace(/^@/, "");
        return (
          <article key={person.selectionId || person.id} className={cardClass}>
            <ChannelPreview
              channel={{ title: person.title, photoUrl: person.imageUrl }}
              avatarKind="person"
              subtitle={
                person.contactInfo || (username ? `@${username}` : "Person")
              }
              rightAction={
                <TelegramCardActionsMenu label={`Actions for ${person.title}`}>
                  <TelegramCardMenuAction
                    danger
                    label="Delete person"
                    icon={<Trash2 size={17} />}
                    onClick={() => onDelete(person)}
                  />
                </TelegramCardActionsMenu>
              }
              className="!mb-0 !border-0 !bg-transparent !p-0"
            />
            {person.notes ? (
              <p className="mt-4 line-clamp-3 border-t border-neutral-800 pt-3 text-sm text-neutral-400">
                {person.notes}
              </p>
            ) : null}
          </article>
        );
      })}
    </MasonryGrid>
  );
}

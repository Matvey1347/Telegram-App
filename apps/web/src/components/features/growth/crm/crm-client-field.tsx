"use client";

import { useEffect, useState } from "react";
import type { TelegramAdvertiser } from "@telegram-system/shared";
import { CustomSelect, Input } from "@/components/ui/primitives";
import { SegmentedControl } from "@/components/ui/segmented-control";

export function canonicalTelegramUsername(value: string) {
  const username = value.trim().replace(/^@+/, "");
  return /^[a-z\d_]{5,32}$/i.test(username) ? `@${username.toLowerCase()}` : "";
}

export function isValidTelegramUsernameInput(value: string) {
  return Boolean(canonicalTelegramUsername(value));
}

/**
 * Telegram usernames are case-insensitive identity keys. Older imports can
 * contain two CRM rows for the same username, but a picker must never offer
 * two visually indistinguishable clients for one Telegram account.
 */
export function dedupeAdvertisersByTelegramIdentity(
  advertisers: TelegramAdvertiser[],
) {
  const seen = new Set<string>();
  return advertisers.filter((advertiser) => {
    const username = advertiser.telegramUsername
      ?.trim()
      .replace(/^@+/, "")
      .toLowerCase();
    const key = username
      ? `telegram:${username}`
      : `advertiser:${advertiser.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function advertiserContact(advertiser: TelegramAdvertiser) {
  return (
    advertiser.telegramUsername ??
    advertiser.email ??
    advertiser.phone ??
    advertiser.contacts?.find((item) => item.isPrimary)?.value ??
    ""
  );
}

export function CrmClientField(props: {
  contact: string;
  selectedAdvertiserId: string | null;
  selectedClient?: {
    id: string;
    displayName: string;
    telegramUsername?: string | null;
    photoUrl?: string | null;
  } | null;
  onContactChange: (value: string) => void;
  onTelegramChange: (value: string) => void;
  onSelect: (advertiser: TelegramAdvertiser | null) => void;
  onSearchAdvertisers: (query: string) => Promise<TelegramAdvertiser[]>;
}) {
  const [mode, setMode] = useState<"new" | "existing">(
    props.selectedAdvertiserId ? "existing" : "new",
  );
  const [previousSelectedId, setPreviousSelectedId] = useState(
    props.selectedAdvertiserId,
  );
  const [advertisers, setAdvertisers] = useState<TelegramAdvertiser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  if (props.selectedAdvertiserId !== previousSelectedId) {
    setPreviousSelectedId(props.selectedAdvertiserId);
    setMode(props.selectedAdvertiserId ? "existing" : "new");
  }

  const onSearchAdvertisers = props.onSearchAdvertisers;
  useEffect(() => {
    const query = search.trim();
    // Do not wake the CRM endpoint merely by opening the selector. A broad
    // list is both slower and capped; client lookup is a search interaction.
    if (mode !== "existing" || query.length < 2) {
      return;
    }
    let active = true;
    const timeout = window.setTimeout(() => {
      setLoading(true);
      void onSearchAdvertisers(query)
        .then((items) => {
          if (!active) return;
          // Keep the selected option available while the next server search
          // is loading or when its result no longer contains that client.
          setAdvertisers((current) => {
            const selected = current.find(
              (item) => item.id === props.selectedAdvertiserId,
            );
            const next =
              selected && !items.some((item) => item.id === selected.id)
                ? [selected, ...items]
                : items;
            return dedupeAdvertisersByTelegramIdentity(next);
          });
        })
        .catch(() => {
          if (active) setAdvertisers([]);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [mode, onSearchAdvertisers, props.selectedAdvertiserId, search]);

  const invalidUsername =
    mode === "new" &&
    Boolean(props.contact.trim()) &&
    !isValidTelegramUsernameInput(props.contact);
  const isSearchingClients =
    loading && mode === "existing" && search.trim().length >= 2;
  const selectedClient =
    props.selectedClient &&
    props.selectedClient.id === props.selectedAdvertiserId
      ? props.selectedClient
      : null;
  const clientOptions = [
    ...(selectedClient
      ? [
          {
            value: selectedClient.id,
            label: selectedClient.displayName,
            meta: selectedClient.telegramUsername ?? "Existing client",
            iconUrl: selectedClient.photoUrl ?? undefined,
            iconFallback: selectedClient.displayName,
          },
        ]
      : []),
    ...advertisers
      .filter((advertiser) => advertiser.id !== selectedClient?.id)
      .map((advertiser) => ({
        value: advertiser.id,
        label: advertiser.displayName,
        meta:
          advertiser.telegramUsername ||
          advertiser.email ||
          advertiser.phone ||
          `${advertiser.totalSalesCount} sales`,
        iconFallback: advertiser.displayName,
      })),
  ];

  return (
    <div className="min-w-0 space-y-1 text-sm">
      <div className="flex h-7 items-center gap-2">
        <span className="text-sm text-neutral-300">Client</span>
        <SegmentedControl
          value={mode}
          ariaLabel="Client source"
          options={[
            { value: "new", label: "New client" },
            { value: "existing", label: "Existing client" },
          ]}
          onChange={(next) => {
            setMode(next);
            props.onSelect(null);
            props.onContactChange("");
            props.onTelegramChange("");
          }}
        />
      </div>
      <div className="[&>div>button]:h-[42px] [&>div>button]:min-h-0">
        {mode === "new" ? (
          <Input
            className="h-[42px]"
            aria-label="Telegram username"
            value={props.contact}
            onChange={(event) => {
              const value = event.target.value;
              props.onContactChange(value);
              props.onTelegramChange(canonicalTelegramUsername(value));
              props.onSelect(null);
            }}
            placeholder="@username or username"
          />
        ) : (
          <CustomSelect
            value={props.selectedAdvertiserId ?? ""}
            placeholder={
              isSearchingClients
                ? "Loading clients..."
                : search.trim().length < 2
                  ? "Type at least 2 characters"
                  : "Select client"
            }
            options={clientOptions}
            loading={isSearchingClients}
            loadingLabel="Searching clients…"
            onSearchChange={setSearch}
            searchPlaceholder="Search all clients"
            onChange={(id) => {
              if (id === selectedClient?.id) {
                props.onSelect({
                  id: selectedClient.id,
                  displayName: selectedClient.displayName,
                  telegramUsername: selectedClient.telegramUsername ?? null,
                } as TelegramAdvertiser);
                return;
              }
              const advertiser = advertisers.find((item) => item.id === id);
              if (!advertiser) return;
              const contact = advertiserContact(advertiser);
              props.onSelect(advertiser);
              props.onContactChange(contact);
              props.onTelegramChange(
                canonicalTelegramUsername(advertiser.telegramUsername ?? ""),
              );
            }}
          />
        )}
      </div>
      {invalidUsername ? (
        <p className="text-xs text-red-400">
          Telegram username must contain 5–32 letters, numbers, or underscores
        </p>
      ) : null}
    </div>
  );
}

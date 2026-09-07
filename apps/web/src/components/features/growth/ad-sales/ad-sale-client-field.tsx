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

function advertiserContact(advertiser: TelegramAdvertiser) {
  return (
    advertiser.telegramUsername ??
    advertiser.email ??
    advertiser.phone ??
    advertiser.contacts?.find((item) => item.isPrimary)?.value ??
    ""
  );
}

export function AdSaleClientField(props: {
  contact: string;
  selectedAdvertiserId: string | null;
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
  const [loading, setLoading] = useState(false);

  if (props.selectedAdvertiserId !== previousSelectedId) {
    setPreviousSelectedId(props.selectedAdvertiserId);
    setMode(props.selectedAdvertiserId ? "existing" : "new");
  }

  const onSearchAdvertisers = props.onSearchAdvertisers;

  useEffect(() => {
    if (mode !== "existing") return;
    let active = true;
    const timeout = window.setTimeout(() => {
      setLoading(true);
      void onSearchAdvertisers("")
        .then((items) => {
          if (active) setAdvertisers(items);
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
  }, [mode, onSearchAdvertisers]);

  const invalidUsername =
    mode === "new" &&
    Boolean(props.contact.trim()) &&
    !isValidTelegramUsernameInput(props.contact);

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
            placeholder={loading ? "Loading clients..." : "Select client"}
            disabled={loading}
            options={advertisers.map((advertiser) => {
              const username = advertiser.telegramUsername?.replace(/^@+/, "");
              return {
                value: advertiser.id,
                label: advertiser.displayName,
                meta:
                  advertiser.telegramUsername ||
                  advertiser.email ||
                  advertiser.phone ||
                  `${advertiser.totalSalesCount} sales`,
                iconUrl: username
                  ? `https://t.me/i/userpic/320/${username}.jpg`
                  : undefined,
                iconFallback: advertiser.displayName,
              };
            })}
            onChange={(id) => {
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

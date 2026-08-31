"use client";

import { useEffect, useRef, useState } from "react";
import type { TelegramAdvertiser } from "@telegram-system/shared";
import { CustomSelect, FormField, Input } from "@/components/ui/primitives";
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
  const [advertisers, setAdvertisers] = useState<TelegramAdvertiser[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const previousSelectedId = useRef(props.selectedAdvertiserId);

  useEffect(() => {
    if (props.selectedAdvertiserId) {
      setMode("existing");
    } else if (previousSelectedId.current) {
      setMode("new");
    }
    previousSelectedId.current = props.selectedAdvertiserId;
  }, [props.selectedAdvertiserId]);

  useEffect(() => {
    if (mode !== "existing") return;
    let active = true;
    const timeout = window.setTimeout(() => {
      setLoading(true);
      void props
        .onSearchAdvertisers(search.trim())
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
  }, [mode, props.onSearchAdvertisers, search]);

  const invalidUsername =
    mode === "new" &&
    Boolean(props.contact.trim()) &&
    !isValidTelegramUsernameInput(props.contact);

  return (
    <FormField
      label="Client"
      error={
        invalidUsername
          ? "Telegram username must contain 5–32 letters, numbers, or underscores"
          : undefined
      }
    >
      <div className="space-y-2">
        <SegmentedControl
          value={mode}
          ariaLabel="Client source"
          options={[
            { value: "new", label: "New client" },
            { value: "existing", label: "Existing client" },
          ]}
          onChange={(next) => {
            setMode(next);
            setSearch("");
            props.onSelect(null);
            props.onContactChange("");
            props.onTelegramChange("");
          }}
        />
        {mode === "new" ? (
          <Input
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
          <div className="space-y-2">
            <Input
              aria-label="Search existing clients"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search clients"
            />
            <CustomSelect
              value={props.selectedAdvertiserId ?? ""}
              placeholder={loading ? "Loading clients..." : "Select client"}
              disabled={loading}
              searchable={false}
              options={advertisers.map((advertiser) => {
                const username = advertiser.telegramUsername?.replace(
                  /^@+/,
                  "",
                );
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
          </div>
        )}
      </div>
    </FormField>
  );
}

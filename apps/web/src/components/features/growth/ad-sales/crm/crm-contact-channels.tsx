"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CrmContactDetail, TelegramAdvertiserContact } from "@telegram-system/shared";
import { Button, CustomSelect, Input } from "@/components/ui/primitives";
import { telegramAdSalesApi } from "@/lib/api";
import { CrmContactChannelMark, type CrmContactChannelName } from "./crm-contact-channel-mark";

const channels = [
  { label: "Telegram", type: "TELEGRAM_USERNAME" },
  { label: "Instagram", type: "OTHER" },
  { label: "WhatsApp", type: "OTHER" },
  { label: "Threads", type: "OTHER" },
] as const;

type ChannelType = (typeof channels)[number]["type"];

function presentation(contact: Pick<TelegramAdvertiserContact, "type" | "label">) {
  const configured = channels.find((item) => item.label === contact.label);
  if (configured) return configured;
  if (contact.type === "TELEGRAM_USERNAME") return channels[0];
  return { label: contact.label || "Other", type: contact.type };
}

export function CrmContactChannels({
  contactId,
  canEdit,
  telegramUsername,
  peerUsername,
  initialChannels,
}: {
  contactId: string;
  canEdit: boolean;
  telegramUsername?: CrmContactDetail["telegramUsername"];
  peerUsername?: string | null;
  initialChannels?: CrmContactDetail["contactChannels"];
}) {
  const queryClient = useQueryClient();
  const [channelLabel, setChannelLabel] = useState("Instagram");
  const [value, setValue] = useState("");
  const seededTelegram = useRef<string | null>(null);
  const details = useQuery({
    queryKey: ["telegram-advertiser", contactId, "contact-channels"],
    queryFn: () => telegramAdSalesApi.getAdvertiser(contactId),
  });
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ["telegram-advertiser", contactId, "contact-channels"],
    });
  const add = useMutation({
    mutationFn: (payload: { label: string; value: string; type: ChannelType; isPrimary?: boolean }) =>
      telegramAdSalesApi.addAdvertiserContact(contactId, {
        label: payload.label,
        value: payload.value,
        type: payload.type,
        isPrimary: payload.isPrimary,
      }),
    onSuccess: () => {
      setValue("");
      void refresh();
    },
  });
  const setPrimary = useMutation({
    mutationFn: (channelId: string) =>
      telegramAdSalesApi.setPrimaryAdvertiserContact(contactId, channelId),
    onSuccess: () => void refresh(),
  });
  const contactChannels = useMemo(
    () => details.data?.contacts ?? initialChannels ?? [],
    [details.data?.contacts, initialChannels],
  );
  const availableChannels = useMemo(
    () =>
      channels.filter(
        (channel) =>
          !contactChannels.some(
            (contact) => presentation(contact).label === channel.label,
          ),
      ),
    [contactChannels],
  );
  const selected = availableChannels.find((item) => item.label === channelLabel) ?? availableChannels[0];
  const detectedTelegram = telegramUsername?.replace(/^@+/, "") || peerUsername?.replace(/^@+/, "") || null;

  useEffect(() => {
    if (
      !detectedTelegram ||
      !details.isSuccess ||
      add.isPending ||
      seededTelegram.current === detectedTelegram ||
      contactChannels.some((contact) => contact.type === "TELEGRAM_USERNAME")
    ) return;
    seededTelegram.current = detectedTelegram;
    add.mutate({
      label: "Telegram",
      value: detectedTelegram,
      type: "TELEGRAM_USERNAME",
      isPrimary: true,
    });
  }, [add, contactChannels, details.isSuccess, detectedTelegram]);

  return (
    <section className="space-y-3 border-t border-neutral-800 pt-4">
      <div>
        <h3 className="text-sm font-semibold text-white">Contact channels</h3>
        <p className="text-xs text-neutral-500">
          Keep every place where you contacted this client; mark one as active.
        </p>
      </div>
      <div className="space-y-2">
        {contactChannels.map((contact) => {
          const item = presentation(contact);
          return (
            <div key={contact.id} className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
              <CrmContactChannelMark channel={item.label as CrmContactChannelName} className="h-5 w-5 shrink-0" />
              <span className="w-20 text-sm text-neutral-300">{item.label}</span>
              <a className="min-w-0 flex-1 truncate text-sm text-sky-300 hover:underline" href={contact.type === "TELEGRAM_USERNAME" ? `https://t.me/${contact.value.replace(/^@/, "")}` : contact.value} target="_blank" rel="noreferrer">{contact.value}</a>
              <Button type="button" variant={contact.isPrimary ? "primary" : "secondary"} className="h-8 px-2 text-xs" disabled={!canEdit || contact.isPrimary || setPrimary.isPending} onClick={() => setPrimary.mutate(contact.id)}>
                {contact.isPrimary ? "Active" : "Set active"}
              </Button>
            </div>
          );
        })}
      </div>
      {canEdit && selected ? (
        <div className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
          <CustomSelect
            value={selected.label}
            onChange={setChannelLabel}
            ariaLabel="Contact channel"
            searchable={false}
            options={availableChannels.map((item) => ({
              value: item.label,
              label: item.label,
              icon: <CrmContactChannelMark channel={item.label} className="h-5 w-5" />,
            }))}
          />
          <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Profile link or username" aria-label="Contact channel link" />
          <Button type="button" disabled={!value.trim() || add.isPending} onClick={() => add.mutate({ label: selected.label, value: value.trim(), type: selected.type, isPrimary: contactChannels.length === 0 })}>{add.isPending ? "Adding…" : "Add"}</Button>
        </div>
      ) : null}
    </section>
  );
}

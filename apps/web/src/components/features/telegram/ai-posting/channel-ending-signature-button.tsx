"use client";

import { Button } from "@/components/ui/primitives";
import { appendChannelEndingSignature, channelEndingLink, type ChannelEndingSignatureSource } from "./channel-ending-signature";

export function ChannelEndingSignatureButton({ ending, channel, onChange }: {
  ending: string;
  channel: ChannelEndingSignatureSource;
  onChange: (ending: string) => void;
}) {
  const link = channelEndingLink(channel);
  const included = Boolean(link && ending.includes(link));
  return (
    <div className="space-y-1">
      <Button type="button" variant="secondary" disabled={!link || included} onClick={() => onChange(appendChannelEndingSignature(ending, channel))}>
        {included ? "Подпись канала уже добавлена" : "Добавить иконку и ссылку канала"}
      </Button>
      {!link && <p className="text-xs text-neutral-500">Укажите username или ссылку канала в его настройках.</p>}
    </div>
  );
}

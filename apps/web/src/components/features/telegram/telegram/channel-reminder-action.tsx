"use client";
import { useState } from "react";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { useChannelReminderCopy } from "./use-channel-reminder-copy";
import { ChannelReminderModal } from "./channel-reminder-modal";

export function ChannelReminderAction() {
  const [open, setOpen] = useState(false);
  const t = useChannelReminderCopy();
  return <><Button type="button" onClick={() => setOpen(true)}><BellRing size={16} /> {t("channelReminders.action")}</Button>{open && <ChannelReminderModal onClose={() => setOpen(false)} />}</>;
}

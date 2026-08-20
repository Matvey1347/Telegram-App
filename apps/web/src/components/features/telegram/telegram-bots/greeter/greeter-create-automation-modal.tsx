"use client";

import { useState } from "react";
import type {
  GreeterChannelView,
  GreeterSequenceTrigger,
} from "@telegram-system/shared";
import {
  Button,
  FormField,
  Input,
  Modal,
  Select,
} from "@/components/ui/primitives";

export function CreateGreeterAutomationModal({
  open,
  saving,
  channels,
  onClose,
  onCreate,
}: {
  open: boolean;
  saving: boolean;
  channels: GreeterChannelView[];
  onClose: () => void;
  onCreate: (
    name: string,
    trigger: GreeterSequenceTrigger,
    channelId?: string | null,
  ) => void;
}) {
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<GreeterSequenceTrigger>("AFTER_START");
  const [scope, setScope] = useState<"GLOBAL" | "CHANNEL">("GLOBAL");
  const [channelId, setChannelId] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="New automation">
      <div className="space-y-4">
        <FormField label="Name">
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </FormField>
        <FormField label="Trigger">
          <Select
            value={trigger}
            onChange={(event) =>
              setTrigger(event.target.value as GreeterSequenceTrigger)
            }
          >
            <option value="AFTER_START">After start</option>
            <option value="AFTER_CAPTCHA_SUCCESS">After captcha success</option>
          </Select>
        </FormField>
        <FormField label="Scope">
          <Select
            value={scope}
            onChange={(event) => {
              const next = event.target.value as "GLOBAL" | "CHANNEL";
              setScope(next);
              if (next === "GLOBAL") setChannelId("");
            }}
          >
            <option value="GLOBAL">Global automation</option>
            <option value="CHANNEL">Channel-specific automation</option>
          </Select>
        </FormField>
        {scope === "CHANNEL" ? (
          <FormField label="Channel">
            <Select
              value={channelId}
              onChange={(event) => setChannelId(event.target.value)}
            >
              <option value="">Select channel</option>
              {channels.map((item) => (
                <option key={item.channel.id} value={item.channel.id}>
                  {item.channel.title}
                </option>
              ))}
            </Select>
          </FormField>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              !name.trim() || saving || (scope === "CHANNEL" && !channelId)
            }
            onClick={() =>
              onCreate(
                name.trim(),
                trigger,
                scope === "CHANNEL" ? channelId : null,
              )
            }
          >
            Create
          </Button>
        </div>
      </div>
    </Modal>
  );
}

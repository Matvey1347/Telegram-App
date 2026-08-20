"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type {
  GreeterChannelOverrideInput,
  GreeterChannelView,
  GreeterConfigInput,
} from "@telegram-system/shared";
import { TelegramTextEditor } from "@/components/features/telegram/telegram/telegram-text-editor";
import {
  Button,
  FormField,
  Input,
  Modal,
  Select,
  ToggleRow,
} from "@/components/ui/primitives";
import { greeterApi } from "@/lib/api";
import { useAppToast } from "@/providers/toast-provider";

export function GreeterChannelOverrideControl({
  botId,
  channel,
  onSaved,
}: {
  botId: string;
  channel: GreeterChannelView;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { pushToast } = useAppToast();
  const initial = {
    ...channel.effectiveConfig,
    ...channel.override,
    enabled: channel.enabled,
    useGlobalConfig: channel.useGlobalConfig,
  };
  const [draft, setDraft] = useState<GreeterChannelOverrideInput>(initial);
  const update = (next: Partial<GreeterChannelOverrideInput>) =>
    setDraft((value) => ({ ...value, ...next }));
  const save = useMutation({
    mutationFn: () => greeterApi.updateChannel(botId, channel.id, draft),
    onSuccess: () => {
      setOpen(false);
      onSaved();
      pushToast("Channel override saved.", "success");
    },
    onError: () => pushToast("Failed to save channel override.", "error"),
  });
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setDraft(initial);
          setOpen(true);
        }}
      >
        Configure
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${channel.channel.title} settings`}
        size="xl"
      >
        <div className="space-y-4">
          <ToggleRow
            checked={draft.enabled ?? true}
            onChange={(enabled) => update({ enabled })}
            label="Greeter enabled"
          />
          <ToggleRow
            checked={draft.useGlobalConfig}
            onChange={(useGlobalConfig) => update({ useGlobalConfig })}
            label="Use global captcha settings"
          />
          {!draft.useGlobalConfig ? (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="Challenge type">
                  <Select
                    value={draft.captchaType}
                    onChange={(e) =>
                      update({
                        captchaType: e.target
                          .value as GreeterConfigInput["captchaType"],
                      })
                    }
                  >
                    <option value="BUTTON_CONFIRM">Confirm button</option>
                    <option value="SIMPLE_CHOICE">Simple choice</option>
                  </Select>
                </FormField>
                <FormField label="Timeout (minutes)">
                  <Input
                    type="number"
                    min={1}
                    value={draft.timeoutMinutes}
                    onChange={(e) =>
                      update({ timeoutMinutes: Number(e.target.value) })
                    }
                  />
                </FormField>
              </div>
              <FormField label="Captcha message">
                <TelegramTextEditor
                  value={draft.captchaMessage || ""}
                  onChange={(captchaMessage) => update({ captchaMessage })}
                  rows={6}
                />
              </FormField>
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="Confirm button">
                  <Input
                    value={draft.confirmButtonText || ""}
                    onChange={(e) =>
                      update({ confirmButtonText: e.target.value })
                    }
                  />
                </FormField>
                <FormField label="Choice prompt">
                  <Input
                    value={draft.choicePrompt || ""}
                    onChange={(e) => update({ choicePrompt: e.target.value })}
                  />
                </FormField>
                <FormField label="Success message">
                  <Input
                    value={draft.successMessage || ""}
                    onChange={(e) =>
                      update({ successMessage: e.target.value || null })
                    }
                  />
                </FormField>
                <FormField label="Failure message">
                  <Input
                    value={draft.failureMessage || ""}
                    onChange={(e) =>
                      update({ failureMessage: e.target.value || null })
                    }
                  />
                </FormField>
              </div>
              <FormField label="On failure">
                <Select
                  value={draft.failureBehavior}
                  onChange={(e) =>
                    update({
                      failureBehavior: e.target
                        .value as GreeterConfigInput["failureBehavior"],
                    })
                  }
                >
                  <option value="KEEP_PENDING">Keep pending</option>
                  <option value="DECLINE">Decline request</option>
                </Select>
              </FormField>
            </>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDraft(initial)}>
              Reset
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save override
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

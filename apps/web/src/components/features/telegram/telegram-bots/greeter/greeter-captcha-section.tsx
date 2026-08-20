"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  GreeterConfigInput,
  GreeterConfigView,
  GreeterOverview,
  GreeterTemplatePreview,
} from "@telegram-system/shared";
import { TelegramTextEditor } from "@/components/features/telegram/telegram/telegram-text-editor";
import { TelegramPostPreview } from "@/components/features/telegram/telegram/telegram-post-preview";
import {
  Button,
  Card,
  FormField,
  Input,
  Modal,
  Select,
  ToggleRow,
} from "@/components/ui/primitives";
import { greeterApi } from "@/lib/api";
import { greeterKeys } from "@/lib/query-keys";
import { useAppToast } from "@/providers/toast-provider";

export function GreeterCaptchaSection({
  botId,
  config,
  configuration,
}: {
  botId: string;
  config: GreeterConfigView;
  configuration: GreeterOverview["configuration"];
}) {
  const qc = useQueryClient();
  const { pushToast } = useAppToast();
  const [override, setDraft] = useState<GreeterConfigInput | null>(null);
  const [rendered, setRendered] = useState<GreeterTemplatePreview | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const draft = override ?? config;
  const save = useMutation({
    mutationFn: () => greeterApi.updateConfig(botId, draft),
    onSuccess: () => {
      setDraft(null);
      void qc.invalidateQueries({ queryKey: greeterKeys.overview(botId) });
      pushToast("Captcha draft saved.", "success");
    },
    onError: () => pushToast("Failed to save captcha settings.", "error"),
  });
  const publish = useMutation({
    mutationFn: () => greeterApi.publishConfig(botId, configuration.draftRevision),
    onSuccess: () => {
      setConfirmPublish(false);
      void qc.invalidateQueries({ queryKey: greeterKeys.overview(botId) });
      pushToast("GREETER configuration published.", "success");
    },
    onError: () =>
      pushToast("Failed to publish. Reload the latest draft and try again.", "error"),
  });
  const preview = useMutation({
    mutationFn: () =>
      greeterApi.previewTemplate(botId, draft.captchaMessage, {}),
    onSuccess: setRendered,
    onError: () => pushToast("Failed to render captcha preview.", "error"),
  });
  const update = (next: Partial<GreeterConfigInput>) => {
    setDraft({ ...draft, ...next });
    setRendered(null);
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
            <div>
              <p className="text-sm font-medium text-white">Draft configuration</p>
              <p className="mt-1 text-xs text-neutral-400">
                Draft r{configuration.draftRevision} · Published r{configuration.publishedRevision}
                {configuration.publishedAt
                  ? ` on ${new Date(configuration.publishedAt).toLocaleString()}`
                  : " · never published"}
              </p>
            </div>
            <span
              className={`rounded border px-2 py-1 text-xs ${configuration.hasUnpublishedChanges ? "border-amber-500/30 bg-amber-500/10 text-amber-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"}`}
            >
              {configuration.hasUnpublishedChanges
                ? "Unpublished changes"
                : "Production is current"}
            </span>
          </div>
          <ToggleRow
            checked={draft.captchaEnabled}
            onChange={(captchaEnabled) => update({ captchaEnabled })}
            label="Require captcha"
            description="Verify users before approving their join request."
          />
          <div className="grid gap-4 md:grid-cols-2">
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
              value={draft.captchaMessage}
              onChange={(captchaMessage) => update({ captchaMessage })}
              rows={7}
            />
          </FormField>
          <FormField label="Confirm button text">
            <Input
              value={draft.confirmButtonText}
              onChange={(e) => update({ confirmButtonText: e.target.value })}
            />
          </FormField>
          {draft.captchaType === "SIMPLE_CHOICE" ? (
            <FormField label="Choice prompt">
              <Input
                value={draft.choicePrompt}
                onChange={(e) => update({ choicePrompt: e.target.value })}
              />
            </FormField>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
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
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setDraft(null);
                setRendered(null);
              }}
            >
              Reset
            </Button>
            <Button
              variant="secondary"
              onClick={() => preview.mutate()}
              disabled={preview.isPending}
            >
              {preview.isPending ? "Rendering" : "Preview"}
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving" : "Save draft"}
            </Button>
            <Button
              onClick={() => setConfirmPublish(true)}
              disabled={
                !configuration.hasUnpublishedChanges ||
                override !== null ||
                save.isPending ||
                publish.isPending
              }
            >
              Publish
            </Button>
          </div>
          {override !== null ? (
            <p className="text-right text-xs text-amber-300">
              Save the local edits as a draft before publishing.
            </p>
          ) : null}
        </div>
      </Card>
      <Card>
        <h3 className="mb-3 font-semibold text-white">
          Server-rendered preview
        </h3>
        {preview.isError ? (
          <p className="text-sm text-rose-300">
            Preview unavailable. Try again.
          </p>
        ) : (
          <>
            <TelegramPostPreview
              channelTitle="Greeter bot"
              text={
                rendered?.renderedText || "Click Preview to render variables."
              }
              imageUrls={[]}
            />
            {(rendered?.buttons.flat() || []).map((button, index) => (
              <span
                key={index}
                className="mt-2 block rounded-lg bg-blue-600 px-3 py-2 text-center text-sm text-white"
              >
                {button.text}
              </span>
            ))}
          </>
        )}
      </Card>
      <Modal
        open={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        title="Publish GREETER configuration"
      >
        <p className="text-sm text-neutral-300">
          Publish draft revision {configuration.draftRevision}? New production
          interactions will use these captcha and channel settings. Test users
          already use the draft.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmPublish(false)}>
            Cancel
          </Button>
          <Button onClick={() => publish.mutate()} disabled={publish.isPending}>
            {publish.isPending ? "Publishing" : "Confirm publish"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

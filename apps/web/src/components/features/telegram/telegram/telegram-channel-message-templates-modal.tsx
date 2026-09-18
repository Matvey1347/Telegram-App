"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessagesSquare, Plus, Send } from "lucide-react";
import type {
  ResolvedEmoji,
  TelegramChannelMessageTemplate,
  TelegramMessageTemplateScopeMode,
} from "@telegram-system/shared";
import { IconAvatar } from "@/components/icons/icon-avatar";
import type { TelegramChannel, TelegramChannelNetwork } from "@/lib/api";
import {
  Button,
  Card,
  ConfirmDeleteModal,
  ErrorState,
  IconButton,
  LoadingState,
  Modal,
} from "@/components/ui/primitives";
import {
  telegramChannelMessageTemplatesApi,
  telegramMessageTemplateKeys,
} from "@/lib/features/telegram/telegram-channel-message-templates-api";
import {
  normalizeTelegramChannelMessageTemplateDraft,
  emptyTelegramMessageTemplatePayload,
  TELEGRAM_MESSAGE_TEMPLATE_DRAFT_NAMESPACE,
  type TelegramChannelMessageTemplateDraftForm,
} from "./telegram-channel-message-template-draft";
import { TelegramChannelMessageTemplateEditor } from "./telegram-channel-message-template-editor";
import { TelegramChannelAvatarList } from "./telegram-channel-avatar-list";
import { renderTelegramChannelMessageTemplate } from "./telegram-channel-message-template-format";
import { telegramSystemBotApi } from "@/lib/api";
import { useAppToast } from "@/providers/toast-provider";
import { ModalDraftPicker } from "@/components/ui/modal-draft-picker";
import { useWorkspaceModalDrafts } from "@/hooks/use-workspace-modal-drafts";
import {
  selectedWorkspaceDraftScope,
  type WorkspaceDraftPreview,
  type WorkspaceFormDraft,
} from "@/lib/workspace-modal-drafts";

type EditorState = {
  initial?:
    | TelegramChannelMessageTemplate
    | WorkspaceFormDraft<TelegramChannelMessageTemplateDraftForm>;
};

type DeleteTarget = { kind: "saved"; id: string; name: string };

type TemplateScope = {
  scopeMode: TelegramMessageTemplateScopeMode;
  networkId?: string | null;
  channelIds: string[];
};

const fallbackTemplateIcon: ResolvedEmoji = {
  type: "unicode",
  value: "📣",
};

export function TelegramChannelMessageTemplatesModal({
  channels,
  networks,
  onClose,
}: {
  channels: TelegramChannel[];
  networks: TelegramChannelNetwork[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [localDraft, setLocalDraft] =
    useState<TelegramChannelMessageTemplateDraftForm>(() => ({
      payload: emptyTelegramMessageTemplatePayload(),
      savedTemplateId: null,
    }));
  const [draftPreview, setDraftPreview] = useState<
    WorkspaceDraftPreview | undefined
  >();
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const editingSavedTemplate = Boolean(
    editor?.initial && !("form" in editor.initial),
  );
  const templates = useQuery({
    queryKey: telegramMessageTemplateKeys.list(),
    queryFn: telegramChannelMessageTemplatesApi.list,
  });
  const restoreDraft = useCallback(
    (
      value: TelegramChannelMessageTemplateDraftForm,
      draft?: WorkspaceFormDraft<TelegramChannelMessageTemplateDraftForm>,
    ) => {
      setLocalDraft(value);
      setDraftPreview(draft?.preview);
      if (draft) setEditor({ initial: draft });
    },
    [],
  );
  const modalDrafts =
    useWorkspaceModalDrafts<TelegramChannelMessageTemplateDraftForm>({
      namespace: TELEGRAM_MESSAGE_TEMPLATE_DRAFT_NAMESPACE,
      workspaceId: selectedWorkspaceDraftScope(),
      schemaVersion: 1,
      open: true,
      enabled: !editingSavedTemplate,
      value: localDraft,
      preview: draftPreview,
      createInitialValue: () => ({
        payload: emptyTelegramMessageTemplatePayload(),
        savedTemplateId: null,
      }),
      normalize: normalizeTelegramChannelMessageTemplateDraft,
      onRestore: restoreDraft,
      isMeaningful: (draft) =>
        JSON.stringify(draft.payload) !==
        JSON.stringify(emptyTelegramMessageTemplatePayload()),
    });
  const updateLocalDraft = useCallback(
    (
      value: TelegramChannelMessageTemplateDraftForm,
      preview: WorkspaceDraftPreview,
    ) => {
      setLocalDraft(value);
      setDraftPreview(preview);
    },
    [],
  );
  const removeSaved = useMutation({
    mutationFn: telegramChannelMessageTemplatesApi.remove,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: telegramMessageTemplateKeys.all,
      }),
  });
  const sendSaved = useMutation({
    mutationFn: async (template: TelegramChannelMessageTemplate) => {
      const source = await telegramChannelMessageTemplatesApi.source({
        templateId: template.id,
      });
      const text = renderTelegramChannelMessageTemplate(
        template.bodyTemplate,
        source.channels,
        {
          overrideInviteLinks: template.overrideInviteLinks,
          inviteLinkOverrides: template.inviteLinkOverrides,
          excludedProductNames: template.excludedProductNames,
          priceRounding: template.priceRounding,
          productNameOverrides: template.productNameOverrides,
          bundleOfferEnabled: template.bundleOfferEnabled,
          bundleDiscountPercent: template.bundleDiscountPercent,
          bundleBasePriceOverrides: template.bundleBasePriceOverrides,
        },
      );
      return telegramSystemBotApi.sendPostPreview({
        title: template.title || "Channel list",
        text,
        imageUrls: [],
        buttonRows: [],
      });
    },
    onSuccess: () => pushToast("Preview sent to System Bot", "success"),
    onError: () =>
      pushToast(
        "Could not send the preview. Check the System Bot connection.",
        "error",
      ),
  });
  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={editor ? "Edit message template" : "Autogenerated messages"}
        titleIcon={<MessagesSquare size={19} aria-hidden="true" />}
        size="xl"
      >
        {editor ? (
          <TelegramChannelMessageTemplateEditor
            channels={channels}
            networks={networks}
            initial={editor.initial}
            onDraftChange={updateLocalDraft}
            onClearDraft={modalDrafts.clearCurrentDraft}
            onBack={() => {
              modalDrafts.showDraftPicker();
              setEditor(null);
            }}
            onSaved={() => setEditor(null)}
          />
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="max-w-2xl text-sm leading-5 text-neutral-400">
                Create reusable Telegram channel lists from live links, TgStat
                settings and product prices. Saved templates are shared in this
                workspace; unfinished drafts stay on this device.
              </p>
              <Button
                type="button"
                onClick={() => {
                  modalDrafts.createNewDraft();
                  setEditor({});
                }}
              >
                <Plus size={16} /> New template
              </Button>
            </div>
            <ModalDraftPicker
              drafts={modalDrafts.pendingDrafts}
              onContinue={modalDrafts.continueDraft}
              onDelete={modalDrafts.deleteDraft}
              onCreateNew={() => {
                modalDrafts.createNewDraft();
                setEditor({});
              }}
            />
            <section>
              <h3 className="mb-2 text-sm font-semibold text-neutral-200">
                Saved templates
              </h3>
              {templates.isLoading ? <LoadingState /> : null}
              {templates.isError ? (
                <ErrorState text="Could not load message templates." />
              ) : null}
              {!templates.isLoading && !templates.data?.length ? (
                <Card className="text-sm text-neutral-400">
                  No saved templates yet. Create one or continue a local draft.
                </Card>
              ) : null}
              <div className="grid gap-2 md:grid-cols-2">
                {templates.data?.map((template) => (
                  <Card
                    key={template.id}
                    className="flex items-center gap-3 p-3"
                  >
                    <IconAvatar
                      icon={template.iconPresentation || fallbackTemplateIcon}
                      label={template.title || "Untitled template"}
                      size="sm"
                      decorative
                    />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        className="block max-w-full text-left"
                        onClick={() => setEditor({ initial: template })}
                      >
                        <span className="block truncate font-medium text-white">
                          {template.title || "Untitled template"}
                        </span>
                      </button>
                      <TemplateScopeSummary
                        scope={template}
                        channels={channels}
                        networks={networks}
                        suffix={`updated ${new Date(template.updatedAt).toLocaleDateString()}`}
                      />
                    </div>
                    <Button
                      type="button"
                      className="h-10 shrink-0 gap-2 px-3"
                      aria-label={`Send ${template.title || "template"} to System Bot`}
                      title="Send to System Bot"
                      disabled={sendSaved.isPending}
                      onClick={() => sendSaved.mutate(template)}
                    >
                      <Send size={16} aria-hidden="true" />
                      <span>Send to bot</span>
                    </Button>
                    <IconButton
                      type="button"
                      aria-label="Edit template"
                      title="Edit template"
                      onClick={() => setEditor({ initial: template })}
                    />
                    <IconButton
                      type="button"
                      kind="delete"
                      aria-label="Delete template"
                      title="Delete template"
                      disabled={removeSaved.isPending}
                      onClick={() =>
                        setDeleteTarget({
                          kind: "saved",
                          id: template.id,
                          name: template.title || "Untitled template",
                        })
                      }
                    />
                  </Card>
                ))}
              </div>
            </section>
          </div>
        )}
      </Modal>
      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        entityName={deleteTarget?.name ?? ""}
        description="The template will be permanently removed from this workspace."
        onConfirm={() => {
          if (!deleteTarget) return;
          return removeSaved.mutateAsync(deleteTarget.id);
        }}
      />
    </>
  );
}

function TemplateScopeSummary({
  scope,
  channels,
  networks,
  suffix,
}: {
  scope: TemplateScope;
  channels: TelegramChannel[];
  networks: TelegramChannelNetwork[];
  suffix: string;
}) {
  const network =
    scope.scopeMode === "NETWORK"
      ? scope.networkId
        ? networks.find((item) => item.id === scope.networkId)
        : networks.find((item) => item.isSystem)
      : null;
  const scopedChannels = network
    ? network.channels
    : scope.channelIds.flatMap((id) => {
        const channel = channels.find((item) => item.id === id);
        return channel ? [channel] : [];
      });
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
      {network ? (
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-neutral-400">
          <IconAvatar
            icon={network.iconPresentation ?? null}
            label={network.name}
            size="xs"
            decorative
          />
          <span className="max-w-36 truncate">{network.name} network</span>
        </span>
      ) : null}
      <TelegramChannelAvatarList
        channels={scopedChannels}
        ariaLabel={`Show ${scopedChannels.length} template channels`}
      />
      <span className="text-xs text-neutral-500">{suffix}</span>
    </div>
  );
}

"use client";

import { useState } from "react";
import { IconPicker } from "@/components/icons/icon-picker";
import { MemberBadge } from "@/components/features/workspace/member-badge";
import { telegramChannelsApi, type PostGroup } from "@/lib/api";
import {
  Button,
  FormField,
  Input,
  Modal,
  Textarea,
  ToggleRow,
} from "@/components/ui/primitives";
import { useI18n } from "@/providers/i18n-provider";

export function GroupFormModal({
  value,
  channelId,
  onClose,
  onSaved,
}: {
  value: PostGroup | "new";
  channelId: string;
  onClose: () => void;
  onSaved: (group: PostGroup) => Promise<void>;
}) {
  const { t } = useI18n();
  const editing = value && value !== "new" ? value : null;
  const [title, setTitle] = useState(editing?.title || "");
  const [description, setDescription] = useState(editing?.description || "");
  const [icon, setIcon] = useState<string | null>(editing?.icon || null);
  const [statusNumberingEnabled, setStatusNumberingEnabled] = useState(
    Boolean(editing?.statusNumberingEnabled),
  );
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={Boolean(value)}
      onClose={onClose}
      title={
        editing
          ? t("telegram.posts.groups.edit")
          : t("telegram.posts.groups.create")
      }
      loading={busy}
      allowOverflow
    >
      <div className="space-y-3">
        <FormField label={t("telegram.posts.groups.titleField")} required>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </FormField>
        <FormField label={t("telegram.posts.groups.icon")}>
          <IconPicker
            iconId={icon}
            onChange={setIcon}
            buttonLabel={t("telegram.posts.icon.addIcon")}
            iconOnly
          />
        </FormField>
        <FormField label={t("telegram.posts.groups.description")}>
          <Textarea
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </FormField>
        <ToggleRow
          checked={statusNumberingEnabled}
          onChange={setStatusNumberingEnabled}
          label={t("telegram.posts.groups.numberByStatus")}
          description={t("telegram.posts.groups.numberByStatusDescription")}
          activeTone="blue"
        />
        {editing ? (
          <div>
            <p className="mb-1 text-xs text-neutral-500">
              {t("telegram.posts.groups.createdBy")}
            </p>
            <MemberBadge member={editing.createdByMember} />
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!title.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const group = editing
                  ? await telegramChannelsApi.updatePostGroup(editing.id, {
                      title: title.trim(),
                      description: description.trim() || null,
                      icon,
                      statusNumberingEnabled,
                    })
                  : await telegramChannelsApi.createPostGroup({
                      telegramChannelId: channelId,
                      title: title.trim(),
                      description: description.trim() || null,
                      icon,
                      statusNumberingEnabled,
                      postIds: [],
                    });
                await onSaved(group);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("telegram.posts.groups.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

"use client";

import type { ReactNode } from "react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ResolvedEmoji } from "@telegram-system/shared";
import type { AdCampaign, AdHypothesis, TelegramChannel } from "@/lib/api";
import { adCampaignsApi } from "@/lib/api";
import { IconPicker } from "@/components/icons/icon-picker";
import { MemberSelect } from "@/components/features/workspace/member-select";
import { ModalDraftPicker } from "@/components/ui/modal-draft-picker";
import { featureModalIcon } from "@/components/ui/feature-modal-icons";
import {
  Button,
  CustomSelect,
  FormField,
  Input,
  Modal,
  Textarea,
} from "@/components/ui/primitives";
import { Pagination } from "@/components/ui/pagination";
import { usePagination } from "@/hooks/use-pagination";
import {
  useWorkspaceModalDrafts,
  type WorkspaceFormDraft,
} from "@/hooks/use-workspace-modal-drafts";
import { selectedWorkspaceDraftScope } from "@/lib/workspace-modal-drafts";
import { AdFormSkeleton } from "./ad-form-skeleton";

export type HypothesisDraftValues = {
  iconId: string | null;
  telegramChannelId: string;
  assignedMemberId: string | null;
  name: string;
  description: string;
  selectedIds: string[];
};

export function isMeaningfulHypothesisDraft(draft: HypothesisDraftValues) {
  return Boolean(
    draft.name.trim() ||
    draft.iconId ||
    draft.description.trim() ||
    draft.telegramChannelId ||
    draft.selectedIds.length,
  );
}

export function HypothesisFormModal({
  open,
  hypothesis,
  loading = false,
  channels,
  isSubmitting,
  onClose,
  onSubmit,
  renderCampaign,
}: {
  open: boolean;
  hypothesis: AdHypothesis | null;
  loading?: boolean;
  channels: TelegramChannel[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    iconId?: string | null;
    telegramChannelId: string;
    assignedMemberId?: string | null;
    description?: string | null;
    adCampaignIds: string[];
  }) => void | Promise<void>;
  renderCampaign: (
    campaign: AdCampaign,
    checked: boolean,
    onToggle: () => void,
  ) => ReactNode;
}) {
  const [iconId, setIconId] = useState<string | null>(null);
  const [draftIconPresentation, setDraftIconPresentation] =
    useState<ResolvedEmoji | null>(null);
  const [telegramChannelId, setTelegramChannelId] = useState("");
  const [assignedMemberId, setAssignedMemberId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [campaignSearch, setCampaignSearch] = useState("");
  const [error, setError] = useState("");
  const campaignPagination = usePagination({ initialPageSize: 50 });
  const { setPage: setCampaignPage } = campaignPagination;
  const deferredCampaignSearch = useDeferredValue(campaignSearch.trim());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const linkedCampaigns = (
        hypothesis as (AdHypothesis & { campaigns?: AdCampaign[] }) | null
      )?.campaigns;
      setIconId(hypothesis?.iconId || null);
      setDraftIconPresentation(hypothesis?.iconPresentation ?? null);
      setTelegramChannelId(hypothesis?.telegramChannelId || "");
      setAssignedMemberId(
        hypothesis?.assignedMemberId ?? hypothesis?.assignedMember?.id ?? null,
      );
      setName(hypothesis?.name || "");
      setDescription(hypothesis?.description || "");
      setSelectedIds(linkedCampaigns?.map((campaign) => campaign.id) ?? []);
      setCampaignSearch("");
      setCampaignPage(1);
      setError("");
    });
    return () => {
      cancelled = true;
    };
  }, [hypothesis, open, setCampaignPage]);

  const draftValue = useMemo<HypothesisDraftValues>(
    () => ({
      iconId,
      telegramChannelId,
      assignedMemberId,
      name,
      description,
      selectedIds,
    }),
    [
      assignedMemberId,
      description,
      iconId,
      name,
      selectedIds,
      telegramChannelId,
    ],
  );
  const restoreDraft = useCallback(
    (
      draft: HypothesisDraftValues,
      stored?: WorkspaceFormDraft<HypothesisDraftValues>,
    ) => {
      setIconId(draft.iconId ?? null);
      setDraftIconPresentation(stored?.preview?.icon ?? null);
      setTelegramChannelId(draft.telegramChannelId);
      setAssignedMemberId(draft.assignedMemberId);
      setName(draft.name);
      setDescription(draft.description);
      setSelectedIds(draft.selectedIds);
      setCampaignSearch("");
      setError("");
    },
    [],
  );
  const drafts = useWorkspaceModalDrafts<HypothesisDraftValues>({
    namespace: "ads:hypothesis:draft",
    workspaceId: selectedWorkspaceDraftScope(),
    schemaVersion: 1,
    open,
    enabled: !hypothesis,
    value: draftValue,
    preview: {
      title: name || "Untitled hypothesis",
      icon: draftIconPresentation,
    },
    createInitialValue: () => ({
      iconId: null,
      telegramChannelId: "",
      assignedMemberId: null,
      name: "",
      description: "",
      selectedIds: [],
    }),
    onRestore: restoreDraft,
    isMeaningful: isMeaningfulHypothesisDraft,
  });
  const campaignsQuery = useQuery({
    queryKey: [
      "ad-campaigns-hypothesis-form",
      telegramChannelId,
      campaignPagination.page,
      campaignPagination.pageSize,
      deferredCampaignSearch,
    ],
    queryFn: () =>
      adCampaignsApi.listPage({
        telegramChannelId,
        page: campaignPagination.page,
        pageSize: campaignPagination.pageSize,
        search: deferredCampaignSearch || undefined,
      }),
    enabled: open && !loading && Boolean(telegramChannelId),
    placeholderData: keepPreviousData,
  });
  const visibleCampaigns = campaignsQuery.data?.items ?? [];
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const toggleCampaign = (id: string) =>
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  const submit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return setError("Name is required.");
    if (!telegramChannelId) return setError("Telegram channel is required.");
    if (!selectedIds.length)
      return setError("Hypothesis must contain at least 1 campaign.");
    try {
      await onSubmit({
        name: trimmedName,
        iconId,
        telegramChannelId,
        assignedMemberId,
        description: description.trim() || null,
        adCampaignIds: selectedIds,
      });
      drafts.clearCurrentDraft();
    } catch {
      setError("Could not save the hypothesis. Your draft is still available.");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={hypothesis ? "Edit hypothesis" : "Create hypothesis"}
      titleIcon={featureModalIcon("hypothesis")}
    >
      {loading ? <AdFormSkeleton /> : null}
      {!loading && !hypothesis && drafts.pendingDrafts.length ? (
        <ModalDraftPicker
          drafts={drafts.pendingDrafts}
          titleFor={(draft) => draft.name.trim() || "Unfinished hypothesis"}
          onContinue={drafts.continueDraft}
          onDelete={drafts.deleteDraft}
          onCreateNew={drafts.createNewDraft}
        />
      ) : null}
      {!loading && (hypothesis || !drafts.pendingDrafts.length) ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)]">
            <FormField label="Emoji">
              <IconPicker
                compact
                iconId={iconId}
                icon={draftIconPresentation}
                onChange={(value, presentation) => {
                  setIconId(value);
                  setDraftIconPresentation(presentation ?? null);
                }}
                buttonLabel="Add emoji"
              />
            </FormField>
            <FormField label="Member">
              <MemberSelect
                value={assignedMemberId}
                onChange={(value) => setAssignedMemberId(value || null)}
                defaultToCurrent={!hypothesis}
              />
            </FormField>
          </div>
          <FormField label="Own Telegram Channel" required>
            <CustomSelect
              value={telegramChannelId}
              onChange={(value) => {
                if (value !== telegramChannelId) setSelectedIds([]);
                setTelegramChannelId(value);
                setCampaignSearch("");
                campaignPagination.resetPage();
                setError("");
              }}
              placeholder="Select channel"
              options={channels.map((channel) => ({
                value: channel.id,
                label: channel.title,
                iconUrl: channel.photoUrl,
                iconFallback: channel.title,
              }))}
            />
          </FormField>
          <FormField label="Name" required>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>
          <FormField label="Description">
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </FormField>
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-200">Campaigns</p>
              <span className="text-xs text-slate-400">
                {selectedIds.length} selected
              </span>
            </div>
            <Input
              value={campaignSearch}
              onChange={(event) => {
                setCampaignSearch(event.target.value);
                campaignPagination.resetPage();
              }}
              placeholder="Search campaigns"
              disabled={!telegramChannelId}
              className="mb-2"
            />
            <div className="max-h-72 space-y-2 overflow-auto rounded-lg border border-slate-800 p-2">
              {campaignsQuery.isLoading && telegramChannelId ? (
                <p className="p-2 text-sm text-slate-400">Loading campaigns…</p>
              ) : null}
              {!telegramChannelId ? (
                <p className="p-2 text-sm text-slate-400">
                  Select a channel to load campaigns.
                </p>
              ) : null}
              {visibleCampaigns.map((campaign) => (
                <div key={campaign.id}>
                  {renderCampaign(campaign, selectedSet.has(campaign.id), () =>
                    toggleCampaign(campaign.id),
                  )}
                </div>
              ))}
              {telegramChannelId &&
              !campaignsQuery.isLoading &&
              !visibleCampaigns.length ? (
                <p className="p-2 text-sm text-slate-400">
                  No campaigns available for this channel.
                </p>
              ) : null}
            </div>
            {campaignsQuery.data ? (
              <Pagination
                {...campaignsQuery.data.pagination}
                onPageChange={campaignPagination.setPage}
                onPageSizeChange={campaignPagination.setPageSize}
                loading={campaignsQuery.isLoading}
              />
            ) : null}
            {error ? (
              <p className="mt-2 text-sm text-rose-300">{error}</p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" disabled={isSubmitting} onClick={submit}>
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

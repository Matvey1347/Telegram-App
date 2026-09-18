"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { resolveTitleTemplate } from "@telegram-system/shared";
import {
  accountsApi,
  advertisingChannelsApi,
  getTelegramChannelPromos,
  type AdCampaign,
  type Promo,
} from "@/lib/api";
import { MemberSelect } from "@/components/features/workspace/member-select";
import { ModalDraftPicker } from "@/components/ui/modal-draft-picker";
import { featureModalIcon } from "@/components/ui/feature-modal-icons";
import {
  Button,
  CustomSelect,
  DateInput,
  FormField,
  Input,
  Modal,
  Textarea,
} from "@/components/ui/primitives";
import { useWorkspaceModalDrafts } from "@/hooks/use-workspace-modal-drafts";
import { selectedWorkspaceDraftScope } from "@/lib/workspace-modal-drafts";
import {
  formatAdCampaignLocalDate as formatLocalDate,
  toAdCampaignInputDate as toInputDate,
} from "./ad-campaign-route-state";
import {
  CampaignMultiValueSelect,
  type CampaignSelectOption,
} from "./campaign-multi-value-select";
import { CampaignInviteLinksSelect } from "./campaign-invite-links-select";
import { accountAdCampaignSelectOption } from "./ad-campaign-view-options";
import { AdFormSkeleton } from "./ad-form-skeleton";

export type CampaignValues = {
  telegramChannelId: string;
  assignedMemberId?: string | null;
  promoIds: string[];
  inviteLinkIds: string[];
  advertisingChannelIds: string[];
  price: number;
  accountId: string;
  date?: string;
  customTitle?: string;
  notes?: string;
};

export function isMeaningfulCampaignDraft(
  draft: CampaignValues,
  defaultDate = formatLocalDate(new Date()),
) {
  return Boolean(
    draft.telegramChannelId ||
    draft.promoIds?.length ||
    draft.inviteLinkIds?.length ||
    draft.advertisingChannelIds?.length ||
    Number(draft.price) ||
    draft.accountId ||
    draft.customTitle?.trim() ||
    draft.notes?.trim() ||
    (draft.date && draft.date !== defaultDate),
  );
}
type CampaignSubmission = Omit<CampaignValues, "customTitle"> & {
  customTitle: string | null;
};
type CampaignChannel = {
  id: string;
  title: string;
  photoUrl?: string | null;
  username?: string | null;
  adminLinks?: unknown[];
};
type CampaignSource = {
  id?: string;
  selectionId?: string;
  advertisingSourceId?: string;
  telegramChannelId?: string;
  sourceKind?: string;
  kind?: string;
  type?: string;
  telegramUsername?: string | null;
  contactInfo?: string | null;
  title?: string;
  name?: string;
  photoUrl?: string | null;
  imageUrl?: string | null;
  username?: string | null;
};
type CampaignInitial = Partial<AdCampaign> & {
  assignedMember?: { id?: string } | null;
  promoIds?: string[];
  inviteLinkIds?: string[];
  advertisingChannels?: CampaignSource[];
  advertisingSources?: CampaignSource[];
  advertisingChannelIds?: Array<string | CampaignSource>;
  promos?: Promo[];
  promo?: Promo;
  inviteLinks?: never[];
  telegramInviteLink?: never;
  customTitleTemplate?: string | null;
};

function normalizeSelection(value: unknown): string {
  if (typeof value !== "string") return selectionId(value);
  const raw = value.trim();
  if (!raw) return "";
  if (raw.startsWith("source:") || raw.startsWith("person:"))
    return `source:${raw.replace(/^(source|person):/, "")}`;
  return raw.startsWith("channel:") ? raw : `channel:${raw}`;
}
function selectionId(source: unknown): string {
  if (!source) return "";
  if (typeof source === "string") return normalizeSelection(source);
  if (typeof source !== "object") return "";
  const value = source as CampaignSource;
  if (value.selectionId) return value.selectionId;
  if (value.advertisingSourceId) return `source:${value.advertisingSourceId}`;
  if (value.telegramChannelId) return `channel:${value.telegramChannelId}`;
  const kind = String(
    value.sourceKind || value.kind || value.type || "",
  ).toLowerCase();
  return kind === "person" ||
    kind === "advertising_source" ||
    value.telegramUsername ||
    value.contactInfo
    ? `source:${value.id}`
    : `channel:${value.id}`;
}
function campaignSources(
  row?: CampaignInitial,
): Array<string | CampaignSource> {
  if (Array.isArray(row?.advertisingChannels)) return row.advertisingChannels;
  if (Array.isArray(row?.advertisingSources)) return row.advertisingSources;
  return Array.isArray(row?.advertisingChannelIds)
    ? row.advertisingChannelIds
    : [];
}
function initialValues(row?: CampaignInitial): CampaignValues {
  return row
    ? {
        telegramChannelId: row.telegramChannelId ?? "",
        assignedMemberId:
          row.assignedMemberId ?? row.assignedMember?.id ?? null,
        promoIds: Array.isArray(row.promoIds)
          ? row.promoIds
          : row.promoId
            ? [row.promoId]
            : [],
        inviteLinkIds: Array.isArray(row.inviteLinkIds)
          ? row.inviteLinkIds
          : row.telegramInviteLinkId
            ? [row.telegramInviteLinkId]
            : [],
        advertisingChannelIds: campaignSources(row)
          .map(selectionId)
          .filter(Boolean),
        price: Number(row.price ?? row.costAmount ?? 0),
        accountId: row.accountId ?? "",
        date: toInputDate(row.placementDate || row.startedAt),
        customTitle: row.customTitleTemplate ?? "",
        notes: row.notes ?? "",
      }
    : {
        telegramChannelId: "",
        assignedMemberId: null,
        promoIds: [],
        inviteLinkIds: [],
        advertisingChannelIds: [],
        price: 0,
        accountId: "",
        date: formatLocalDate(new Date()),
        customTitle: "",
        notes: "",
      };
}
function mergeOptions(
  primary: CampaignSelectOption[],
  fallback: CampaignSelectOption[],
) {
  const byId = new Map<string, CampaignSelectOption>();
  [...fallback, ...primary].forEach(
    (option) => option?.value && byId.set(option.value, option),
  );
  return [...byId.values()];
}
function promoOption(promo: Promo): CampaignSelectOption {
  return {
    value: promo.id,
    label: promo.title,
    iconUrl:
      promo.iconPresentation?.type === "image"
        ? promo.iconPresentation.url
        : undefined,
    iconEmoji:
      promo.iconPresentation?.type === "unicode"
        ? promo.iconPresentation.value
        : undefined,
    iconFallback: promo.title,
    description: promo.telegramChannel?.title,
    searchText: promo.text,
  };
}
function isOwnChannel(channel: CampaignChannel) {
  return Array.isArray(channel?.adminLinks) && channel.adminLinks.length > 0;
}

export function CampaignModal({
  open,
  onClose,
  onSubmit,
  title,
  initial,
  channels,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (value: CampaignSubmission) => void | Promise<void>;
  title: string;
  initial?: CampaignInitial;
  channels: CampaignChannel[];
  loading?: boolean;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CampaignValues>({
    defaultValues: initialValues(initial),
  });
  const selectedChannelId = watch("telegramChannelId");
  const selectedPromoIds = watch("promoIds") || [];
  const selectedInviteLinkIds = watch("inviteLinkIds") || [];
  const watchedAdChannels = watch("advertisingChannelIds");
  const selectedAdChannels = useMemo(
    () => watchedAdChannels || [],
    [watchedAdChannels],
  );
  const selectedDate = watch("date");
  const customTitleValue = watch("customTitle");
  const campaignDrafts = useWorkspaceModalDrafts<CampaignValues>({
    namespace: "ads:campaign:draft",
    workspaceId: selectedWorkspaceDraftScope(),
    schemaVersion: 1,
    open,
    enabled: !initial,
    value: watch(),
    createInitialValue: () => initialValues(),
    onRestore: useCallback((draft: CampaignValues) => reset(draft), [reset]),
    isMeaningful: isMeaningfulCampaignDraft,
    previewFor: (draft) => ({
      title: draft.customTitle?.trim() || "Unfinished ad campaign",
    }),
  });
  useEffect(() => {
    register("advertisingChannelIds");
    register("promoIds");
    register("inviteLinkIds");
  }, [register]);
  useEffect(() => {
    if (open) reset(initialValues(initial));
  }, [open, initial, reset]);
  useEffect(() => {
    if (!selectedChannelId) return;
    const own = new Set([selectedChannelId, `channel:${selectedChannelId}`]);
    if (selectedAdChannels.some((id) => own.has(id)))
      setValue(
        "advertisingChannelIds",
        selectedAdChannels.filter((id) => !own.has(id)),
        {
          shouldValidate: true,
          shouldDirty: true,
        },
      );
  }, [selectedAdChannels, selectedChannelId, setValue]);
  const { data: promos } = useQuery({
    queryKey: ["channel-promos", selectedChannelId],
    queryFn: () => getTelegramChannelPromos(selectedChannelId),
    enabled: open && !loading && !!selectedChannelId,
  });
  const { data: accounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: accountsApi.list,
    enabled: open && !loading,
  });
  const { data: people } = useQuery({
    queryKey: ["advertising-people"],
    queryFn: advertisingChannelsApi.list,
    enabled: open && !loading,
  });
  const ownChannels = useMemo(
    () => (channels || []).filter(isOwnChannel),
    [channels],
  );
  const promoOptions = useMemo(
    () =>
      mergeOptions(
        (promos ?? []).map(promoOption),
        (initial?.promos || (initial?.promo ? [initial.promo] : [])).map(
          promoOption,
        ),
      ),
    [promos, initial],
  );
  const advertisingSources = useMemo(() => {
    const live = [
      ...(people || []).map((person) => ({
        value: person.selectionId || `source:${person.id}`,
        label: person.title,
        iconUrl: person.imageUrl ?? undefined,
        iconFallback: person.title,
        description: "Person",
        searchText: `${person.username || ""} ${person.contactInfo || ""}`,
      })),
      ...(channels || [])
        .filter((channel) => channel.id !== selectedChannelId)
        .map((channel) => ({
          value: `channel:${channel.id}`,
          label: channel.title,
          iconUrl: channel.photoUrl ?? undefined,
          iconFallback: channel.title,
          description: isOwnChannel(channel)
            ? "Own channel"
            : "External channel",
          searchText: channel.username || "",
        })),
    ];
    const fallback = campaignSources(initial).map((candidate) => {
      const source =
        typeof candidate === "string" ? { id: candidate } : candidate;
      return {
        value: selectionId(source),
        label: source.title || source.name || "Unknown source",
        iconUrl: source.photoUrl || source.imageUrl || undefined,
        iconFallback: source.title || source.name || "Unknown source",
        description:
          source.selectionId?.startsWith("source:") ||
          source.sourceKind === "person" ||
          source.kind === "person"
            ? "Person"
            : "External channel",
        searchText: `${source.username || source.telegramUsername || ""} ${source.contactInfo || ""}`,
      };
    });
    return mergeOptions(live, fallback);
  }, [channels, initial, people, selectedChannelId]);
  const setArray = (
    name: "promoIds" | "inviteLinkIds" | "advertisingChannelIds",
    value: string[],
  ) => setValue(name, value, { shouldValidate: true, shouldDirty: true });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      titleIcon={featureModalIcon("campaign")}
    >
      {loading ? <AdFormSkeleton /> : null}
      {!loading && !initial && campaignDrafts.pendingDrafts.length ? (
        <ModalDraftPicker
          drafts={campaignDrafts.pendingDrafts}
          titleFor={(draft) =>
            draft.customTitle?.trim() || "Unfinished ad campaign"
          }
          onContinue={campaignDrafts.continueDraft}
          onDelete={campaignDrafts.deleteDraft}
          onCreateNew={campaignDrafts.createNewDraft}
        />
      ) : null}
      {!loading && (initial || !campaignDrafts.pendingDrafts.length) ? (
        <form
          className="space-y-3"
          onSubmit={handleSubmit(async (value) => {
            try {
              await onSubmit({
                ...value,
                assignedMemberId: value.assignedMemberId || null,
                promoIds: value.promoIds || [],
                inviteLinkIds: value.inviteLinkIds || [],
                price: Number(value.price),
                advertisingChannelIds: value.advertisingChannelIds || [],
                customTitle: value.customTitle?.trim() || null,
              });
              campaignDrafts.clearCurrentDraft();
            } catch {
              /* Operation feedback owns the API error; keep the draft. */
            }
          })}
        >
          <FormField label="Custom title">
            <Input
              placeholder="[date] // custom campaign name"
              {...register("customTitle")}
            />
            <p className="text-sm text-slate-500">
              Optional. Use [date] to insert the campaign date automatically.
            </p>
            {customTitleValue?.trim() ? (
              <p className="text-sm text-slate-400">
                Preview:{" "}
                {resolveTitleTemplate(customTitleValue, {
                  date: selectedDate || formatLocalDate(new Date()),
                })}
              </p>
            ) : null}
          </FormField>
          <FormField
            label="Own Telegram Channel"
            required
            error={errors.telegramChannelId ? "Required field" : undefined}
          >
            <CustomSelect
              value={selectedChannelId}
              onChange={(value) => {
                setValue("telegramChannelId", value, {
                  shouldValidate: true,
                  shouldDirty: true,
                });
                setArray("promoIds", []);
                setArray("inviteLinkIds", []);
              }}
              placeholder="Select"
              options={ownChannels.map((channel) => ({
                value: channel.id,
                label: channel.title,
                iconUrl: channel.photoUrl ?? undefined,
                iconFallback: channel.title,
              }))}
            />
          </FormField>
          <FormField label="Member">
            <MemberSelect
              value={watch("assignedMemberId") ?? null}
              onChange={(value) =>
                setValue("assignedMemberId", value || null, {
                  shouldDirty: true,
                })
              }
              defaultToCurrent={!initial}
            />
          </FormField>
          <FormField label="Promos">
            <CampaignMultiValueSelect
              value={selectedPromoIds}
              onChange={(value) => setArray("promoIds", value)}
              options={promoOptions}
              placeholder="Select promos"
            />
          </FormField>
          <FormField label="Invite Links">
            <CampaignInviteLinksSelect
              channelId={selectedChannelId}
              campaignId={initial?.id}
              value={selectedInviteLinkIds}
              initialLinks={
                initial?.inviteLinks ||
                (initial?.telegramInviteLink
                  ? [initial.telegramInviteLink]
                  : [])
              }
              enabled={open && !loading}
              onChange={(value) => setArray("inviteLinkIds", value)}
            />
          </FormField>
          <FormField label="Advertising Sources">
            <CampaignMultiValueSelect
              value={selectedAdChannels.filter(
                (id) =>
                  id !== `channel:${selectedChannelId}` &&
                  id !== selectedChannelId,
              )}
              onChange={(value) => setArray("advertisingChannelIds", value)}
              options={advertisingSources}
              placeholder="Select sources"
            />
          </FormField>
          <FormField
            label="Cost amount"
            required
            error={errors.price ? "Required field" : undefined}
          >
            <Input
              type="number"
              step="0.01"
              {...register("price", { valueAsNumber: true, required: true })}
            />
          </FormField>
          <FormField
            label="Account"
            required
            error={errors.accountId ? "Required field" : undefined}
          >
            <CustomSelect
              value={watch("accountId")}
              onChange={(value) =>
                setValue("accountId", value, {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
              placeholder="Select account"
              options={(accounts || []).map(accountAdCampaignSelectOption)}
            />
          </FormField>
          <FormField label="Date">
            <DateInput
              name="date"
              value={selectedDate || ""}
              onChange={(event) =>
                setValue("date", event.target.value, { shouldDirty: true })
              }
            />
          </FormField>
          <FormField label="Notes">
            <Textarea {...register("notes")} />
          </FormField>
          <input
            type="hidden"
            {...register("telegramChannelId", { required: true })}
          />
          <input type="hidden" {...register("accountId", { required: true })} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      ) : null}
    </Modal>
  );
}

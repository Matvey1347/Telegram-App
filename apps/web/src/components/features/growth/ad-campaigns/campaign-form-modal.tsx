"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { CircleHelp } from "lucide-react";
import { resolveTitleTemplate, type ResolvedEmoji } from "@telegram-system/shared";
import {
  accountsApi,
  getTelegramChannelPromos,
  workspaceMembersApi,
  type AdCampaign,
  adCampaignsApi,
  type Promo,
} from "@/lib/api";
import { IconAvatar } from "@/components/icons/icon-avatar";
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
  Tooltip,
  Textarea,
} from "@/components/ui/primitives";
import { useWorkspaceModalDrafts } from "@/hooks/use-workspace-modal-drafts";
import { selectedWorkspaceDraftScope } from "@/lib/workspace-modal-drafts";
import { adCampaignKeys, memberKeys } from "@/lib/query-keys";
import {
  formatAdCampaignLocalDate as formatLocalDate,
  toAdCampaignInputDate as toInputDate,
} from "./ad-campaign-route-state";
import {
  isMeaningfulCampaignDraft,
  normalizeCampaignDraft,
  type CampaignValues,
} from "./campaign-form-draft";
import {
  CampaignMultiValueSelect,
  type CampaignSelectOption,
} from "./campaign-multi-value-select";
import { CampaignInviteLinksSelect } from "./campaign-invite-links-select";
import { accountAdCampaignSelectOption } from "./ad-campaign-view-options";
import { AdFormSkeleton } from "./ad-form-skeleton";
import { CurrencyAmountInput } from "@/components/ui/currency-amount-input";

type CampaignSubmission = Omit<
  CampaignValues,
  "customTitle" | "endedAt"
> & {
  customTitle: string | null;
};
type CampaignChannel = {
  id: string;
  title: string;
  photoUrl?: string | null;
  username?: string | null;
  adminLinks?: unknown[];
  presentationIconPresentation?: ResolvedEmoji | null;
  avatarPresentation?: ResolvedEmoji | null;
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
        inviteLinkWindows: Object.fromEntries((row.inviteLinkWindows ?? []).map((window) => [window.inviteLinkId, { fromDate: window.fromDate, currentRequests: window.currentRequests }])),
        advertisingChannelIds: campaignSources(row)
          .map(selectionId)
          .filter(Boolean),
        price: Number(row.price ?? row.costAmount ?? 0),
        accountId: row.accountId ?? "",
        date: toInputDate(row.placementDate || row.startedAt),
        endedAt: toInputDate(row.endedAt),
        customTitle: row.customTitleTemplate ?? "",
        notes: row.notes ?? "",
      }
    : {
        telegramChannelId: "",
        assignedMemberId: null,
        promoIds: [],
        inviteLinkIds: [],
        inviteLinkWindows: {},
        advertisingChannelIds: [],
        price: undefined,
        accountId: "",
        date: formatLocalDate(new Date()),
        customTitle: "[date]##",
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
    getValues,
    reset,
    formState: { errors },
  } = useForm<CampaignValues>({
    defaultValues: initialValues(initial),
  });
  const selectedChannelId = watch("telegramChannelId");
  const selectedPromoIds = watch("promoIds") || [];
  const selectedInviteLinkIds = watch("inviteLinkIds") || [];
  const inviteLinkWindows = watch("inviteLinkWindows") || {};
  const windowsQuery = useQuery({ queryKey: adCampaignKeys.inviteLinkWindows(initial?.id), queryFn: () => adCampaignsApi.inviteLinkWindows(initial!.id!), enabled: open && Boolean(initial?.id), staleTime: 0 });
  const watchedAdChannels = watch("advertisingChannelIds");
  const selectedAdChannels = useMemo(
    () => watchedAdChannels || [],
    [watchedAdChannels],
  );
  const selectedDate = watch("date");
  const customTitleValue = watch("customTitle");
  const { data: members } = useQuery({
    queryKey: memberKeys.membersSelect(),
    queryFn: workspaceMembersApi.select,
    enabled: open && !loading,
  });
  const draftPreview = useCallback(
    (draft: CampaignValues) => {
      const channel = channels.find((item) => item.id === draft.telegramChannelId);
      const member = members?.find((item) => item.id === draft.assignedMemberId);
      const avatars = [
        channel
          ? { label: channel.title, imageUrl: channel.photoUrl }
          : null,
        member
          ? {
              label: member.user.name,
              icon: member.avatarPresentation,
            }
          : null,
      ].filter((avatar): avatar is NonNullable<typeof avatar> => Boolean(avatar));
      const selected = [channel?.title, member?.user.name].filter(Boolean);
      return {
        title: draft.customTitle?.trim() || "Unfinished ad campaign",
        subtitle: selected.length ? selected.join(" · ") : undefined,
        avatars: avatars.length ? avatars : undefined,
      };
    },
    [channels, members],
  );
  const campaignDrafts = useWorkspaceModalDrafts<CampaignValues>({
    namespace: "ads:campaign:draft",
    workspaceId: selectedWorkspaceDraftScope(),
    schemaVersion: 1,
    open,
    enabled: !initial,
    value: watch(),
    createInitialValue: () => initialValues(),
    normalize: normalizeCampaignDraft,
    onRestore: useCallback((draft: CampaignValues) => reset(draft), [reset]),
    isMeaningful: isMeaningfulCampaignDraft,
    previewFor: draftPreview,
  });
  useEffect(() => {
    register("advertisingChannelIds");
    register("promoIds");
    register("inviteLinkIds");
    register("inviteLinkWindows");
  }, [register]);
  useEffect(() => {
    if (open) reset(initialValues(initial));
  }, [open, initial, reset]);
  useEffect(() => {
    if (open && windowsQuery.data) setValue("inviteLinkWindows", Object.fromEntries(windowsQuery.data.map((item) => [item.inviteLinkId, { fromDate: item.fromDate, currentRequests: item.currentRequests }])));
  }, [open, initial, windowsQuery.data, setValue]);
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
            if (initial?.id && (windowsQuery.isLoading || windowsQuery.isError)) return;
            try {
              const { price, accountId, customTitle } = value;
              await onSubmit({
                telegramChannelId: value.telegramChannelId,
                inviteLinkWindows: value.inviteLinkWindows,
                date: value.date,
                notes: value.notes,
                assignedMemberId: value.assignedMemberId || null,
                promoIds: value.promoIds || [],
                inviteLinkIds: value.inviteLinkIds || [],
                ...(Number.isFinite(Number(price)) && Number(price) > 0
                  ? { price: Number(price) }
                  : {}),
                ...(accountId ? { accountId } : {}),
                advertisingChannelIds: value.advertisingChannelIds || [],
                customTitle: customTitle?.trim() || null,
              });
              campaignDrafts.clearCurrentDraft();
            } catch {
              /* Operation feedback owns the API error; keep the draft. */
            }
          })}
        >
          <FormField label={
            <span className="inline-flex items-center gap-1.5">
              Custom title
              <Tooltip align="left" content={
                <span className="block max-w-64 whitespace-normal">
                  Optional. Use [date] to insert the campaign date automatically.
                  {customTitleValue?.trim() ? <> Preview: {resolveTitleTemplate(customTitleValue, { date: selectedDate || formatLocalDate(new Date()) })}</> : null}
                </span>
              }>
                <button type="button" aria-label="Custom title help" className="inline-flex text-neutral-400 hover:text-white"><CircleHelp size={15} /></button>
              </Tooltip>
            </span>
          }>
            <Input
              placeholder="[date] // custom campaign name"
              {...register("customTitle")}
            />
          </FormField>
          <div className="grid min-w-0 gap-3 sm:grid-cols-3">
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
                  icon: channel.presentationIconPresentation || channel.avatarPresentation
                    ? <span aria-hidden><IconAvatar size="xs" label={channel.title} icon={channel.presentationIconPresentation ?? channel.avatarPresentation} /></span>
                    : undefined,
                  iconUrl: channel.photoUrl ?? undefined,
                  iconFallback: channel.title,
                }))}
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
            <div className="min-w-0 sm:col-span-3"><FormField label="Invite Links">
              <CampaignInviteLinksSelect
                channelId={selectedChannelId}
                campaignId={initial?.id}
                value={selectedInviteLinkIds}
                initialLinks={
                  initial?.inviteLinks ||
                  (initial?.telegramInviteLink ? [initial.telegramInviteLink] : [])
                }
                enabled={open && !loading}
                onChange={(value) => setArray("inviteLinkIds", value)}
                windows={inviteLinkWindows}
                observations={windowsQuery.data}
                onWindowChange={(id, rule) => setValue("inviteLinkWindows", { ...getValues("inviteLinkWindows"), [id]: rule }, { shouldDirty: true })}
              />
            </FormField></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Account">
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
            <FormField label="Amount">
              <CurrencyAmountInput
                type="number"
                step="0.01"
                placeholder="Add later"
                currency={accounts?.find((account) => account.id === watch("accountId"))?.currency}
                {...register("price", { valueAsNumber: true })}
              />
            </FormField>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Date">
              <DateInput
                name="date"
                value={selectedDate || ""}
                onChange={(event) =>
                  setValue("date", event.target.value, { shouldDirty: true })
                }
              />
            </FormField>
          </div>
          <FormField label="Notes">
            <Textarea {...register("notes")} />
          </FormField>
          <input
            type="hidden"
            {...register("telegramChannelId", { required: true })}
          />
          <input type="hidden" {...register("accountId")} />
          {windowsQuery.isError && <p role="alert" className="text-sm text-red-400">Не удалось загрузить даты ссылок. Закройте окно и попробуйте снова.</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={Boolean(initial?.id && (windowsQuery.isLoading || windowsQuery.isError))}>Save</Button>
          </div>
        </form>
      ) : null}
    </Modal>
  );
}

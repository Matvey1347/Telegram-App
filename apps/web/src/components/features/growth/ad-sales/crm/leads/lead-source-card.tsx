"use client";
import { useLeadText } from "./lead-copy";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LeadSourceView } from "@telegram-system/shared";
import { Button, Card } from "@/components/ui/primitives";
import { leadDiscoveryApi } from "@/lib/features/growth/lead-discovery-api";
import {
  invalidateLeadResults,
  leadKeys,
  patchLeadEntity,
} from "@/lib/features/growth/lead-discovery-query";
import { displayLeadDate, leadSafeUrl } from "./lead-utils";
import { LeadMaterialImport } from "./lead-material-import";
import { LeadSourceSettings } from "./lead-source-settings";
export function LeadSourceCard({
  source,
  canManage,
  enabled,
}: {
  source: LeadSourceView;
  canManage: boolean;
  enabled: boolean;
}) {
  const t = useLeadText();
  const client = useQueryClient();
  const [materials, setMaterials] = useState(false);
  const [settings, setSettings] = useState(false);
  const [before, setBefore] = useState<number | undefined>();
  const mutation = useMutation({
    mutationFn: async (
      action: "validate" | "scan" | "recover" | "pause" | "disable" | "resume",
    ) => {
      if (action === "validate") return leadDiscoveryApi.validate(source.id);
      if (action === "scan") return leadDiscoveryApi.scan(source.id, before);
      if (action === "recover") return leadDiscoveryApi.recover(source.id);
      return leadDiscoveryApi.updateSource(source.id, {
        monitoringState:
          action === "pause"
            ? "PAUSED"
            : action === "disable"
              ? "DISABLED"
              : "ACTIVE",
      });
    },
    onSuccess: async (result) => {
      if ("id" in result)
        await patchLeadEntity(
          client,
          leadKeys.sourcesRoot(source.workspaceId),
          result,
        );
      else {
        if ("nextBeforeId" in result)
          setBefore(
            typeof result.nextBeforeId === "number"
              ? result.nextBeforeId
              : undefined,
          );
        await invalidateLeadResults(client, source.workspaceId);
      }
    },
    retry: false,
  });
  const metrics = source.metrics;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words font-semibold">{source.title}</h3>
          {leadSafeUrl(source.url) ? (
            <a
              href={leadSafeUrl(source.url)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center break-all text-xs text-blue-300"
            >
              {source.url}
            </a>
          ) : null}
          <p className="text-xs text-neutral-400">
            {source.type} · {source.accessType} · {source.addedVia}
          </p>
        </div>
        <span className="rounded border border-neutral-700 px-2 py-1 text-xs">
          {source.status}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {[
          ["Observed posts", metrics.observedPosts],
          ["Advertisements", metrics.advertisements],
          ["Unique candidates", metrics.uniqueCandidates],
          ["Confirmed contacts", metrics.confirmedContacts],
          ["Confirmed leads", metrics.confirmedLeads],
          ["Qualified leads", metrics.qualifiedLeads],
          ["Rejected candidates", metrics.rejectedCandidates],
          ["Rejected materials", metrics.rejectedMaterials],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <dt className="text-xs text-neutral-400">{t(String(label))}</dt>
            <dd className="mt-1 font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 border-t border-neutral-800 pt-3 text-xs text-neutral-400">
        <p>Coverage: {source.coverageState}</p>
        <p>
          {displayLeadDate(source.coverageFrom)} →{" "}
          {displayLeadDate(source.coverageTo)}
        </p>
        <p className="mt-1">
          Last observation: {displayLeadDate(source.lastObservedAt)}
        </p>
        <p>Last advertisement: {displayLeadDate(source.lastAdAt)}</p>
        <p>
          Priority: {source.priorityStatus}
          {source.priority === null ? "" : ` · ${source.priority}`}
        </p>
        {source.lastErrorCode ? (
          <p className="mt-2 text-amber-200">
            Access / monitoring error: {source.lastErrorCode}
          </p>
        ) : null}
      </div>
      {canManage ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            className="max-w-full !whitespace-normal"
            variant="secondary"
            disabled={mutation.isPending || !enabled}
            onClick={() => mutation.mutate("validate")}
          >
            {t("Validate access")}
          </Button>
          {source.type === "TELEGRAM_CHANNEL" ? (
            <>
              <Button
                className="max-w-full !whitespace-normal"
                variant="secondary"
                disabled={mutation.isPending || !enabled}
                onClick={() => mutation.mutate("scan")}
              >
                {before ? "Scan next older batch" : "Scan up to 50 posts"}
              </Button>
              <Button
                className="max-w-full !whitespace-normal"
                variant="secondary"
                disabled={mutation.isPending || !enabled}
                onClick={() => mutation.mutate("recover")}
              >
                {t("Recover available updates")}
              </Button>
            </>
          ) : null}
          <Button
            className="max-w-full !whitespace-normal"
            variant="secondary"
            disabled={
              mutation.isPending ||
              (source.monitoringState !== "ACTIVE" && !enabled)
            }
            onClick={() =>
              mutation.mutate(
                source.monitoringState === "ACTIVE" ? "pause" : "resume",
              )
            }
          >
            {source.monitoringState === "ACTIVE"
              ? "Pause"
              : "Enable monitoring"}
          </Button>
          <Button
            className="max-w-full !whitespace-normal"
            variant="secondary"
            disabled={
              mutation.isPending || source.monitoringState === "DISABLED"
            }
            onClick={() => mutation.mutate("disable")}
          >
            {t("Disable source")}
          </Button>
          <Button
            className="max-w-full !whitespace-normal"
            variant="secondary"
            disabled={!enabled}
            onClick={() => setMaterials(true)}
          >
            {t("Import materials")}
          </Button>
          <Button
            className="max-w-full !whitespace-normal"
            variant="secondary"
            onClick={() => setSettings(true)}
          >
            {t("Processing settings")}
          </Button>
        </div>
      ) : null}
      {mutation.isError ? (
        <p role="alert" className="mt-3 text-sm text-amber-200">
          {t(
            "Action failed. Check deployment grants, live account, source access and limits. No automatic join or retry occurs.",
          )}
        </p>
      ) : null}
      {mutation.data && !("id" in mutation.data) ? (
        <p role="status" className="mt-3 text-xs text-neutral-300">
          Received {mutation.data.received} · Changed {mutation.data.changed} ·
          Unchanged {mutation.data.unchanged} ·{" "}
          {mutation.data.gap ? "Coverage gap reported" : "No new gap reported"}
        </p>
      ) : null}
      {materials ? (
        <LeadMaterialImport
          workspace={source.workspaceId}
          source={source.id}
          onClose={() => setMaterials(false)}
        />
      ) : null}
      {settings ? (
        <LeadSourceSettings
          source={source}
          onClose={() => setSettings(false)}
        />
      ) : null}
    </Card>
  );
}

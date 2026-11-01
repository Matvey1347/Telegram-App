"use client";
import { salesStatusLabel, useCrmSalesCopy } from "../crm-sales-copy";
import { useState } from "react";
import { ManualClientContext } from "./manual-client-context";
import type { CrmManualInstagramAction } from "@telegram-system/shared";
import { Button, Textarea, FormField } from "@/components/ui/primitives";
import { crmManualApi } from "@/lib/features/growth/crm-manual-api";
import { useManualWorkflow } from "./use-manual-workflow";
import { InstagramMethodEditor } from "./instagram-method-editor";
import { CrmFollowUpForm } from "../crm-follow-up-form";
import { safeInstagramProfile } from "./safe-contact-url";
const actions: [CrmManualInstagramAction, string][] = [
  ["CONTACTED", "Mark contacted"],
  ["WAITING_FOR_REPLY", "Waiting for reply"],
  ["REPLIED", "Mark replied"],
  ["INTERESTED", "Interested"],
  ["CLOSED", "Closed"],
  ["DO_NOT_CONTACT", "Do not contact"],
  ["RESET_STATUS", "Reset sales status"],
];
export function ManualContactPanel({
  workspace,
  contactId,
  compact = false,
}: {
  workspace: string;
  contactId: string;
  compact?: boolean;
}) {
  const statusCopy = useCrmSalesCopy();
  const { query, mutation, run } = useManualWorkflow(workspace, contactId);
  const [note, setNote] = useState("");
  const [edit, setEdit] = useState<string | null>(null);
  const [schedule, setSchedule] = useState(false);
  const [historyCursor, setHistoryCursor] = useState<string | undefined>();
  const [older, setOlder] = useState<
    NonNullable<typeof query.data>["activities"]
  >([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState(false);
  const w = query.data;
  const report = (action: CrmManualInstagramAction) => {
    const payload = {
      action,
      note: note.trim() || undefined,
    };
    void run(JSON.stringify(payload), (operationId) =>
      crmManualApi.activity(contactId, { ...payload, operationId }),
    )
      .then(() => setNote(""))
      .catch(() => {});
  };
  return (
    <section
      className="min-w-0 space-y-4"
      aria-label="Manual Instagram workflow"
    >
      <header>
        <h2 className="text-lg font-semibold">
          Instagram · manual communication
        </h2>
        <p className="text-xs text-neutral-400">
          Records are reported by a person. No messages, delivery or read status
          are synchronized.
        </p>
      </header>
      {query.isLoading ? <p role="status">Loading manual contact…</p> : null}
      {query.isError ? (
        <div role="alert">
          Manual contact unavailable.{" "}
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : null}
      {w ? (
        <>
          <div className="space-y-3">
            {w.methods.map((m) => (
              <div
                key={m.id}
                className="space-y-2 rounded-lg border border-neutral-800 p-3"
              >
                <p className="break-all font-medium">
                  @{m.username} · {m.state === "ACTIVE" ? "Active" : "Stale"}
                </p>
                <p className="break-all text-xs text-neutral-400">
                  Original: {m.value}
                </p>
                <p className="text-xs text-amber-200">
                  {m.ownershipConfirmed
                    ? "Human ownership confirmed"
                    : "Ownership unconfirmed"}{" "}
                  · Profile existence unverified
                </p>
                <div className="flex flex-wrap gap-2">
                  {safeInstagramProfile(m) ? (
                    <a
                      className="inline-flex min-h-11 items-center rounded-lg bg-neutral-800 px-3 text-sm text-blue-300"
                      href={safeInstagramProfile(m)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open Instagram
                    </a>
                  ) : (
                    <span className="text-xs text-amber-200">
                      Profile is stale. Review its current username before
                      outreach.
                    </span>
                  )}
                  {w.canEdit ? (
                    <>
                      <Button
                        variant="secondary"
                        disabled={mutation.isPending}
                        onClick={() => setEdit(edit === m.id ? null : m.id)}
                      >
                        Review / change profile
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={mutation.isPending || m.state === "STALE"}
                        onClick={() =>
                          void run(`stale:${m.id}`, () =>
                            crmManualApi.updateInstagram(contactId, m.id, {
                              value: m.value,
                              ownershipConfirmed: false,
                              state: "STALE",
                            }),
                          ).catch(() => {})
                        }
                      >
                        Mark stale
                      </Button>
                    </>
                  ) : null}
                </div>
                {edit === m.id && w.canEdit ? (
                  <InstagramMethodEditor
                    key={m.id}
                    method={m}
                    pending={mutation.isPending}
                    onSave={(input) =>
                      run(JSON.stringify(input), () =>
                        crmManualApi.updateInstagram(contactId, m.id, input),
                      ).then(() => setEdit(null))
                    }
                  />
                ) : null}
              </div>
            ))}
          </div>
          {!w.methods.length && w.canEdit ? (
            <InstagramMethodEditor
              pending={mutation.isPending}
              onSave={(input) =>
                run(JSON.stringify(input), () =>
                  crmManualApi.addInstagram(contactId, input),
                )
              }
            />
          ) : null}
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-neutral-500">Sales attention</dt>
              <dd>
                {w.attentionStatus
                  ? salesStatusLabel(w.attentionStatus, statusCopy)
                  : "No manual contact yet"}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Last manual contact</dt>
              <dd>
                {w.lastContactedAt
                  ? new Date(w.lastContactedAt).toLocaleString()
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Last manual reply</dt>
              <dd>
                {w.lastRepliedAt
                  ? new Date(w.lastRepliedAt).toLocaleString()
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Next follow-up</dt>
              <dd>
                {w.nextFollowUp
                  ? new Date(w.nextFollowUp.effectiveAt).toLocaleString()
                  : "—"}
              </dd>
            </div>
          </dl>
          {!w.commercialOutreachAllowed ? (
            <p role="status" className="text-sm text-amber-200">
              Commercial outreach blocked:{" "}
              {w.outreachBlockedReason ?? "Review identity and permissions"}
            </p>
          ) : null}
          {w.canEdit ? (
            <>
              <FormField label="Short manual note (optional)">
                <Textarea
                  aria-label="Short manual note"
                  rows={2}
                  maxLength={300}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </FormField>
              <div className="flex flex-wrap gap-2">
                {actions.map(([action, label]) => (
                  <Button
                    key={action}
                    className="min-h-11 max-w-full !whitespace-normal"
                    variant="secondary"
                    disabled={
                      mutation.isPending ||
                      (!w.commercialOutreachAllowed &&
                        [
                          "CONTACTED",
                          "WAITING_FOR_REPLY",
                          "INTERESTED",
                        ].includes(action))
                    }
                    onClick={() => report(action)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <Button
                variant="secondary"
                disabled={mutation.isPending || !w.commercialOutreachAllowed}
                onClick={() => setSchedule(!schedule)}
              >
                Needs follow-up
              </Button>
              {schedule ? (
                <CrmFollowUpForm
                  mode="schedule"
                  pending={mutation.isPending}
                  error={mutation.isError}
                  onSubmit={(at, title) =>
                    run(JSON.stringify({ at, title }), (operationId) =>
                      crmManualApi.schedule(contactId, {
                        operationId,
                        at,
                        title,
                      }),
                    ).then(() => setSchedule(false))
                  }
                />
              ) : null}
              {w.nextFollowUp ? (
                <div className="space-y-2 rounded-lg border border-neutral-800 p-3">
                  <p className="text-sm">{w.nextFollowUp.title}</p>
                  <div className="flex flex-wrap gap-2">
                    {(["COMPLETE", "CANCEL"] as const).map((action) => (
                      <Button
                        key={action}
                        variant="secondary"
                        disabled={mutation.isPending}
                        onClick={() =>
                          void run(`${action}:${w.nextFollowUp!.id}`, () =>
                            crmManualApi.followUp(
                              contactId,
                              w.nextFollowUp!.id,
                              { action },
                            ),
                          ).catch(() => {})
                        }
                      >
                        {action === "COMPLETE"
                          ? "Complete follow-up"
                          : "Cancel follow-up"}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-neutral-400">
              View only · manual changes are unavailable.
            </p>
          )}
          <section className="space-y-2 border-t border-neutral-800 pt-3">
            <h3 className="font-semibold">Manual activity</h3>
            {[...w.activities, ...older]
              .filter((v, i, all) => all.findIndex((a) => a.id === v.id) === i)
              .map((v) => (
                <div
                  key={v.id}
                  className="break-words text-xs text-neutral-400"
                >
                  {actions.find(([action]) => action === v.action)?.[1] ??
                    "Offer reported sent"}{" "}
                  · {new Date(v.occurredAt).toLocaleString()} · Manually
                  reported · {v.actorMemberId ?? "Member"}
                  {v.note ? <p>{v.note}</p> : null}
                </div>
              ))}
            {!w.activities.length ? (
              <p className="text-sm text-neutral-400">
                No manual activity recorded.
              </p>
            ) : null}
            {(historyCursor ?? w.nextCursor) ? (
              <Button
                variant="secondary"
                disabled={loadingOlder}
                onClick={() => {
                  setLoadingOlder(true);
                  setOlderError(false);
                  void crmManualApi
                    .workflow(
                      contactId,
                      historyCursor ?? w.nextCursor ?? undefined,
                    )
                    .then((page) => {
                      setOlder((prev) => [...prev, ...page.activities]);
                      setHistoryCursor(page.nextCursor ?? "");
                    })
                    .catch(() => setOlderError(true))
                    .finally(() => setLoadingOlder(false));
                }}
              >
                Load older activity
              </Button>
            ) : null}
            {olderError ? (
              <p role="alert">
                History unavailable. Retry loading older activity.
              </p>
            ) : null}
          </section>
          {!compact ? <ManualClientContext contactId={contactId} /> : null}
        </>
      ) : null}
      {mutation.isPending ? <p role="status">Saving manual record…</p> : null}
      {mutation.isError ? (
        <p role="alert" className="text-sm text-amber-200">
          Could not save. Check permissions, DNC, current identity and approval.
          An identity conflict requires review. Retry the same action safely.
        </p>
      ) : null}
    </section>
  );
}

"use client";

import { useMemo, useState } from "react";
import { type PostGroup } from "@/lib/api";
import {
  Button,
  DateInput,
  FormField,
  Input,
  Modal,
  TimeInput,
  localDateTimeInputToDate,
} from "@/components/ui/primitives";
import { useI18n } from "@/providers/i18n-provider";

export function PublishGroupModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (options: {
    includeScheduled: boolean;
    includeFailed: boolean;
    republishPublished: boolean;
  }) => Promise<void>;
}) {
  const { t } = useI18n();
  const [includeScheduled, setIncludeScheduled] = useState(true);
  const [includeFailed, setIncludeFailed] = useState(true);
  const [republishPublished, setRepublishPublished] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("telegram.posts.groups.publishAllTitle")}
    >
      <div className="space-y-4">
        <p className="text-sm text-neutral-300">
          {t("telegram.posts.groups.publishDescription")}
        </p>
        {[
          [
            t("telegram.posts.groups.includeScheduled"),
            includeScheduled,
            setIncludeScheduled,
          ],
          [
            t("telegram.posts.groups.retryFailed"),
            includeFailed,
            setIncludeFailed,
          ],
          [
            t("telegram.posts.groups.republishPublished"),
            republishPublished,
            setRepublishPublished,
          ],
        ].map(([label, checked, setter]) => (
          <label
            key={String(label)}
            className="flex items-center gap-2 text-sm"
          >
            <input
              type="checkbox"
              checked={checked as boolean}
              onChange={(event) =>
                (setter as (value: boolean) => void)(event.target.checked)
              }
            />
            {label as string}
          </label>
        ))}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() =>
              onSubmit({
                includeScheduled,
                includeFailed,
                republishPublished,
              })
            }
          >
            {t("telegram.posts.groups.publishAllAction")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function ScheduleGroupModal({
  open,
  group,
  onClose,
  onSubmit,
}: {
  open: boolean;
  group?: PostGroup;
  onClose: () => void;
  onSubmit: (payload: {
    startDate: string;
    time: string;
    intervalDays: number;
    timezone?: string;
    includeDraftsOnly?: boolean;
    overwriteExistingScheduled?: boolean;
    includeFailed?: boolean;
  }) => Promise<void>;
}) {
  const { t } = useI18n();
  const localDate = new Date();
  localDate.setDate(localDate.getDate() + 1);
  const [startDate, setStartDate] = useState(
    localDate.toISOString().slice(0, 10),
  );
  const [time, setTime] = useState("10:00");
  const [intervalDays, setIntervalDays] = useState(1);
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const [overwrite, setOverwrite] = useState(false);
  const [includeDraftsOnly, setIncludeDraftsOnly] = useState(false);
  const [includeFailed, setIncludeFailed] = useState(true);
  const preview = useMemo(
    () =>
      (group?.posts || [])
        .filter((post) => {
          if (post.status === "DRAFT") return true;
          if (includeDraftsOnly) return false;
          if (post.status === "FAILED") return includeFailed;
          if (post.status === "SCHEDULED") return overwrite;
          return false;
        })
        .map((post, index) => {
          const date =
            localDateTimeInputToDate(startDate, time) ?? new Date(NaN);
          date.setDate(date.getDate() + index * intervalDays);
          return { post, date };
        }),
    [
      group?.posts,
      startDate,
      time,
      intervalDays,
      includeDraftsOnly,
      includeFailed,
      overwrite,
    ],
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("telegram.posts.groups.schedule")}
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label={t("telegram.posts.groups.startDate")} required>
            <DateInput
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </FormField>
          <FormField label={t("telegram.posts.groups.time")} required>
            <TimeInput
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </FormField>
          <FormField label={t("telegram.posts.groups.intervalDays")} required>
            <Input
              type="number"
              min={1}
              value={intervalDays}
              onChange={(event) =>
                setIntervalDays(Math.max(1, Number(event.target.value)))
              }
            />
          </FormField>
        </div>
        <FormField label={t("telegram.posts.groups.timezone")}>
          <Input
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
          />
        </FormField>
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(event) => setOverwrite(event.target.checked)}
            />
            {t("telegram.posts.groups.overwriteScheduled")}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeDraftsOnly}
              onChange={(event) => setIncludeDraftsOnly(event.target.checked)}
            />
            {t("telegram.posts.groups.draftsOnly")}
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeFailed}
              onChange={(event) => setIncludeFailed(event.target.checked)}
            />
            {t("telegram.posts.groups.includeFailed")}
          </label>
        </div>
        {preview.length ? (
          <div className="max-h-44 space-y-1 overflow-auto rounded-lg border border-neutral-800 p-2">
            {preview.map(({ post, date }) => (
              <div
                key={post.id}
                className="flex justify-between gap-3 text-xs text-neutral-300"
              >
                <span className="truncate">{post.title}</span>
                <span className="shrink-0">{date.toLocaleString()}</span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!startDate || !time || intervalDays < 1}
            onClick={() =>
              onSubmit({
                startDate,
                time,
                intervalDays,
                timezone,
                overwriteExistingScheduled: overwrite,
                includeDraftsOnly,
                includeFailed,
              })
            }
          >
            {t("telegram.posts.groups.schedule")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

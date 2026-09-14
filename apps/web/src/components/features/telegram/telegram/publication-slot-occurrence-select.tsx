"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { telegramPublicationSchedulesApi } from "@/lib/api";
import { telegramPublicationScheduleKeys } from "@/lib/query-keys";
import { FormField, Select } from "@/components/ui/primitives";
import { useI18n } from "@/providers/i18n-provider";

export function PublicationSlotOccurrenceSelect({ channelId, value, onChange }: {
  channelId: string;
  value: string | null;
  onChange: (value: { slotId: string; scheduledAt: string }) => void;
}) {
  const { t } = useI18n();
  const [range] = useState(() => {
    const from = new Date();
    return { from: from.toISOString(), to: new Date(from.getTime() + 62 * 86400000).toISOString() };
  });
  const occurrences = useQuery({
    queryKey: telegramPublicationScheduleKeys.occurrences(channelId, range),
    queryFn: () => telegramPublicationSchedulesApi.occurrences(channelId, range),
  });
  return <FormField label={t("telegram.posts.schedules.chooseSlot")} required>
    <Select value={value ?? ""} disabled={occurrences.isLoading || occurrences.isError} onChange={(event) => {
      const occurrence = occurrences.data?.find((item) => `${item.slotId}:${item.scheduledAt}` === event.target.value);
      if (occurrence) onChange(occurrence);
    }}>
      <option value="">{occurrences.isLoading ? t("telegram.posts.schedules.loadingOccurrences") : occurrences.isError ? t("telegram.posts.schedules.occurrencesError") : t("telegram.posts.schedules.selectOccurrence")}</option>
      {occurrences.data?.map((item) => <option key={`${item.slotId}:${item.scheduledAt}`} value={`${item.slotId}:${item.scheduledAt}`}>
        {new Date(item.scheduledAt).toLocaleString()} · {item.title} · {t(`telegram.posts.schedules.kind.${item.kind}`)}
      </option>)}
    </Select>
  </FormField>;
}

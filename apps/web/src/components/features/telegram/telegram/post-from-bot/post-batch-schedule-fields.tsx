"use client";

import { useState } from "react";
import { DateInput, FormField, TimeInput } from "@/components/ui/primitives";
import {
  defaultScheduleIso,
  localScheduleParts,
  scheduleIso,
} from "./post-batch-model";

export function PostBatchScheduleFields({
  value,
  disabled,
  dateLabel,
  timeLabel,
  onChange,
}: {
  value: string | null;
  disabled?: boolean;
  dateLabel: string;
  timeLabel: string;
  onChange: (value: string | null) => void;
}) {
  const [initial] = useState(() =>
    localScheduleParts(value ?? defaultScheduleIso()),
  );
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField label={dateLabel}>
        <DateInput
          value={date}
          disabled={disabled}
          onChange={(event) => {
            const nextDate = event.target.value;
            setDate(nextDate);
            onChange(scheduleIso(nextDate, time));
          }}
        />
      </FormField>
      <FormField label={timeLabel}>
        <TimeInput
          value={time}
          disabled={disabled}
          onChange={(event) => {
            const nextTime = event.target.value;
            setTime(nextTime);
            onChange(scheduleIso(date, nextTime));
          }}
        />
      </FormField>
    </div>
  );
}

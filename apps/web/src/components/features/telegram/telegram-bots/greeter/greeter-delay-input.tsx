import { FormField, Input, Select } from "@/components/ui/primitives";

export type DelayUnit = "seconds" | "minutes" | "hours" | "days";

const multipliers: Record<DelayUnit, number> = {
  seconds: 1,
  minutes: 60,
  hours: 60 * 60,
  days: 24 * 60 * 60,
};

export function preferredDelayUnit(delaySeconds: number): DelayUnit {
  if (delaySeconds > 0 && delaySeconds % multipliers.days === 0) return "days";
  if (delaySeconds > 0 && delaySeconds % multipliers.hours === 0)
    return "hours";
  if (delaySeconds > 0 && delaySeconds % multipliers.minutes === 0)
    return "minutes";
  return "seconds";
}

export function GreeterDelayInput({
  index,
  delaySeconds,
  unit,
  onUnitChange,
  onChange,
}: {
  index: number;
  delaySeconds: number;
  unit: DelayUnit;
  onUnitChange: (unit: DelayUnit) => void;
  onChange: (delaySeconds: number) => void;
}) {
  const value = delaySeconds / multipliers[unit];
  return (
    <div className="grid flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
      <FormField label={`Step ${index + 1} delay`}>
        <Input
          type="number"
          min={0}
          value={value}
          onChange={(event) =>
            onChange(
              Math.round(
                Math.max(0, Number(event.target.value)) * multipliers[unit],
              ),
            )
          }
        />
      </FormField>
      <FormField label="Unit">
        <Select
          value={unit}
          onChange={(event) => {
            const next = event.target.value as DelayUnit;
            onUnitChange(next);
            onChange(Math.round(value * multipliers[next]));
          }}
        >
          <option value="seconds">Seconds</option>
          <option value="minutes">Minutes</option>
          <option value="hours">Hours</option>
          <option value="days">Days</option>
        </Select>
      </FormField>
    </div>
  );
}

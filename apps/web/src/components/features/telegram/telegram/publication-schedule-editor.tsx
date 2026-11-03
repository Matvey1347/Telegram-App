import { Plus, Trash2 } from "lucide-react";
import type {
  ResolvedEmoji,
  TelegramPublicationScheduleInput,
  TelegramPublicationSlotKind,
} from "@telegram-system/shared";
import { IconPicker } from "@/components/icons/icon-picker";
import {
  Button,
  FormField,
  Input,
  Select,
  TimeInput,
  canonicalizeTimeInputValue,
} from "@/components/ui/primitives";

export const PUBLICATION_SLOT_KINDS: Array<{
  value: TelegramPublicationSlotKind;
  label: string;
}> = [
  { value: "CONTENT", label: "📝 Regular publication" },
  { value: "AD", label: "📣 Advertising / mutual promotion" },
];

export function sortPublicationSlots<T extends { time: string }>(slots: readonly T[]): T[] {
  return [...slots].sort((a, b) =>
    (canonicalizeTimeInputValue(a.time) ?? "99:99").localeCompare(
      canonicalizeTimeInputValue(b.time) ?? "99:99",
    ),
  );
}

export function PublicationScheduleEditor({
  draft,
  icon,
  onIconChange,
  onChange,
}: {
  draft: TelegramPublicationScheduleInput;
  icon: ResolvedEmoji | null;
  onIconChange: (iconId: string | null, icon?: ResolvedEmoji | null) => void;
  onChange: (next: TelegramPublicationScheduleInput) => void;
}) {
  const patchSlot = (
    index: number,
    patch: Partial<TelegramPublicationScheduleInput["slots"][number]>,
  ) =>
    onChange({
      ...draft,
      slots: draft.slots.map((slot, i) =>
        i === index ? { ...slot, ...patch } : slot,
      ),
    });
  return (
    <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
        <FormField label="Emoji">
          <IconPicker
            compact
            iconId={draft.iconId}
            icon={icon}
            onChange={onIconChange}
            buttonLabel="Add emoji"
          />
        </FormField>
        <FormField label="Schedule name" required>
          <Input
            value={draft.name}
            placeholder="Main publication plan"
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
          />
        </FormField>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-neutral-100">Daily publication slots</h3>
          <p className="text-xs text-neutral-500">
            The plan describes the busiest channel. Other channels can use only
            the slots they need. Optional regular slots can be skipped on some days.
          </p>
        </div>
        <Button
          type="button"
          onClick={() =>
            onChange({
              ...draft,
              slots: sortPublicationSlots([
                ...draft.slots,
                { title: "New slot", kind: "CONTENT" as const, time: "12:00" },
              ]),
            })
          }
        >
          <Plus size={16} /> Slot
        </Button>
      </div>
      <div className="space-y-2">
        {draft.slots.map((slot, index) => (
          <div
            key={slot.id ?? index}
            className="grid gap-2 rounded-lg border border-neutral-800 bg-neutral-950/50 p-3 sm:grid-cols-[minmax(0,1fr)_180px_150px_120px_44px]"
          >
            <Input
              aria-label={`Slot ${index + 1} title`}
              value={slot.title}
              onChange={(event) => patchSlot(index, { title: event.target.value })}
            />
            <Select
              aria-label={`Slot ${index + 1} type`}
              value={slot.kind}
              onChange={(event) =>
                patchSlot(index, {
                  kind: event.target.value as TelegramPublicationSlotKind,
                  isOptional: event.target.value === "CONTENT" ? slot.isOptional : false,
                })
              }
            >
              {PUBLICATION_SLOT_KINDS.map((kind) => (
                <option key={kind.value} value={kind.value}>{kind.label}</option>
              ))}
            </Select>
            {slot.kind === "CONTENT" ? <Select aria-label={`Slot ${index + 1} requirement`} value={slot.isOptional ? "optional" : "required"} onChange={(event) => patchSlot(index, { isOptional: event.target.value === "optional" })}>
              <option value="required">Required</option>
              <option value="optional">Optional</option>
            </Select> : <span aria-hidden="true" />}
            <TimeInput
              aria-label={`Slot ${index + 1} time`}
              value={slot.time}
              onChange={(event) => patchSlot(index, { time: event.target.value })}
              onBlur={(event) => {
                const time = canonicalizeTimeInputValue(event.target.value);
                if (!time) return;
                const slots = draft.slots.map((item, i) => i === index ? { ...item, time } : item);
                onChange({ ...draft, slots: sortPublicationSlots(slots) });
              }}
            />
            <Button
              type="button"
              variant="danger"
              aria-label={`Remove slot ${index + 1}`}
              onClick={() =>
                onChange({
                  ...draft,
                  slots: draft.slots.filter((_, i) => i !== index),
                })
              }
            >
              <Trash2 size={16} />
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

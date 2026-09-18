import type { TelegramAdAvailabilitySlot } from "@telegram-system/shared";
import type { TelegramChannel } from "@/lib/api";
import { channelLocalDateKey } from "@/lib/features/growth/telegram-ad-sales";
import { formatDateWithWeekday } from "@/lib/date-format";
import { Modal, Skeleton } from "@/components/ui/primitives";
import type { SalePlacementDraft } from "./ad-sale-types";

export function AdSaleSlotPickerModal({
  placement,
  channels,
  workspaceTimezone,
  loading,
  error,
  slotsByDate,
  onClose,
  onApply,
}: {
  placement: SalePlacementDraft | null;
  channels: TelegramChannel[];
  workspaceTimezone: string;
  loading: boolean;
  error: string;
  slotsByDate: [string, TelegramAdAvailabilitySlot[]][];
  onClose: () => void;
  onApply: (slot: TelegramAdAvailabilitySlot) => void;
}) {
  return (
    <Modal
      open={Boolean(placement)}
      onClose={onClose}
      title="Choose a nearby date"
      size="xl"
    >
      <p className="mb-4 text-sm text-neutral-400">
        {placement
          ? `Available dates for ${channels.find((channel) => channel.id === placement.channelId)?.title ?? "this channel"}. Choose the time manually in the placement.`
          : "Choose an available date. Time stays unchanged."}
      </p>
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      ) : error ? (
        <p className="rounded-lg border border-rose-700 bg-rose-950/30 p-3 text-sm text-rose-200">
          {error}
        </p>
      ) : slotsByDate.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {slotsByDate.map(([date, slots]) => {
            const today = channelLocalDateKey(new Date(), workspaceTimezone);
            const isToday = date === today;
            const isPast = date < today;
            return (
              <button
                key={date}
                type="button"
                onClick={() => onApply(slots[0])}
                className={`rounded-xl border p-3 text-left transition hover:-translate-y-0.5 ${
                  isPast
                    ? "border-rose-700/80 bg-rose-950/30 hover:border-rose-500"
                    : "border-emerald-700/80 bg-emerald-950/30 hover:border-emerald-500"
                } ${isToday ? "ring-1 ring-emerald-400" : ""}`}
              >
                <span className="block text-sm font-medium text-white">
                  {formatDateWithWeekday(`${date}T12:00:00`)}
                </span>
                <span
                  className={`mt-2 block text-xs ${isPast ? "text-rose-300" : "text-emerald-300"}`}
                >
                  {isToday
                    ? "Today · Available"
                    : isPast
                      ? "Past date"
                      : "Available"}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-neutral-700 p-4 text-sm text-neutral-400">
          No available slots were found in this period.
        </p>
      )}
    </Modal>
  );
}

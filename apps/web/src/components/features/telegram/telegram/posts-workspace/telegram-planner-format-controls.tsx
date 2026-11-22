"use client";

import { useI18n } from "@/providers/i18n-provider";
import { IconPicker } from "@/components/icons/icon-picker";
import * as Slider from "@radix-ui/react-slider";
import { plannerFormatResolvedIcon } from "./telegram-post-workspace-model";

export function PlannerFormatEmojiPicker({
  value,
  disabled,
  className = "h-9 w-9",
  iconClassName = "!h-5 !w-5 !bg-transparent",
  onChange,
  onError,
}: {
  value?: string | null;
  disabled?: boolean;
  className?: string;
  iconClassName?: string;
  onChange: (nextIcon: string | null) => void | Promise<void>;
  onError: (error: unknown) => void;
}) {
  const { t } = useI18n();
  const handleEmojiChange = async (emoji: string | null) => {
    await onChange(emoji);
  };
  return (
    <IconPicker
      compact
      allowImages={false}
      disabled={disabled}
      icon={plannerFormatResolvedIcon(value)}
      onChange={() => {}}
      onEmojiChange={(emoji) => {
        void handleEmojiChange(emoji).catch(onError);
      }}
      buttonLabel={t("telegram.posts.icon.addEmoji")}
      iconOnly
      className={className}
      iconClassName={iconClassName}
    />
  );
}

export function PlannerFormatWeightSlider({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const percent = Math.max(0, Math.min(100, value));
  return (
    <Slider.Root
      value={[percent]}
      min={0}
      max={100}
      step={1}
      disabled={disabled}
      onValueChange={([nextValue]) => onChange(nextValue ?? 0)}
      className="relative flex h-8 w-full touch-none select-none items-center data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60"
      aria-label={label}
    >
      <Slider.Track className="relative h-2 grow overflow-hidden rounded-full bg-neutral-800">
        <Slider.Range className="absolute h-full rounded-full bg-blue-500" />
      </Slider.Track>
      <Slider.Thumb
        className="block h-4 w-4 rounded-full border-2 border-white bg-blue-500 shadow-sm shadow-black/50 outline-none ring-blue-500/30 transition focus-visible:ring-4"
        aria-label={label}
      />
    </Slider.Root>
  );
}

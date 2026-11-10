import { SegmentedControl } from "@/components/ui/segmented-control";

export type AiPostingSettingsTab =
  | "context"
  | "sources"
  | "formats"
  | "autopilot";

const options: Array<{ value: AiPostingSettingsTab; label: string }> = [
  { value: "context", label: "Контекст" },
  { value: "sources", label: "Источники" },
  { value: "formats", label: "Форматы" },
  { value: "autopilot", label: "Автопилот" },
];

export function AiPostingSettingsTabs({
  value,
  onChange,
}: {
  value: AiPostingSettingsTab;
  onChange: (tab: AiPostingSettingsTab) => void;
}) {
  return (
    <SegmentedControl
      value={value}
      onChange={onChange}
      ariaLabel="Раздел настроек AI Posting"
      options={options}
    />
  );
}

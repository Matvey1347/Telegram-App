import type { CrmTagSummary } from "@telegram-system/shared";
import type { ReactNode } from "react";
import { MultiSelect } from "@/components/ui/primitives";
import {
  CrmTagEmoji,
  CrmTelegramFolderBadge,
  crmTagDisplayName,
} from "./crm-tag-presentation";

export function CrmTagMultiSelect({
  tags,
  value,
  onChange,
  disabled,
  className,
  placeholder = "Select tags",
  canCreateOption,
  createOptionLabel,
  onCreateOption,
  creatingOption,
}: {
  tags: CrmTagSummary[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  canCreateOption?: (name: string) => boolean;
  createOptionLabel?: (name: string) => ReactNode;
  onCreateOption?: (name: string) => void | Promise<void>;
  creatingOption?: boolean;
}) {
  return (
    <MultiSelect
      value={value}
      onChange={onChange}
      disabled={disabled}
      options={tags.map((tag) => ({
        value: tag.id,
        label: crmTagDisplayName(tag),
        icon: (
          <span className="inline-flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: tag.color ?? "#737373" }}
            />
            <CrmTagEmoji tag={tag} />
            <CrmTelegramFolderBadge tag={tag} />
          </span>
        ),
      }))}
      placeholder={placeholder}
      searchPlaceholder="Search tags"
      canCreateOption={canCreateOption}
      createOptionLabel={createOptionLabel}
      onCreateOption={onCreateOption}
      creatingOption={creatingOption}
      className={className}
    />
  );
}

import { Forward } from "lucide-react";
import {
  DateInput,
  FormField,
  Input,
  Textarea,
  TimeInput,
} from "@/components/ui/primitives";
import type { FolderDraft } from "./mutual-promotion-form-types";

export function MutualPromotionFolderDetails({
  draft,
  titlePreview,
  editing,
  allPaid,
  onChange,
}: {
  draft: FolderDraft;
  titlePreview: string;
  editing: boolean;
  allPaid: boolean;
  onChange: (draft: FolderDraft) => void;
}) {
  return (
    <div className="space-y-4">
      <FormField label="Folder title" required>
        <Input
          autoFocus
          value={draft.title}
          onChange={(event) => onChange({ ...draft, title: event.target.value })}
          placeholder="September // [date-range]"
        />
        <p className="text-xs text-neutral-500">
          Use [date-range] to insert the folder period automatically.
        </p>
        {draft.title.trim() ? (
          <p className="text-xs font-medium text-blue-300">Preview: {titlePreview}</p>
        ) : null}
      </FormField>
      <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
        <FormField label="Starts" required>
          <DateInput
            value={draft.startsDate}
            onChange={(event) => onChange({ ...draft, startsDate: event.target.value })}
          />
        </FormField>
        <FormField label="Time" required>
          <TimeInput
            value={draft.startsTime}
            onChange={(event) => onChange({ ...draft, startsTime: event.target.value })}
          />
        </FormField>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
        <FormField label={allPaid ? "Ends" : "Ends and removes posts"} required>
          <DateInput
            value={draft.endsDate}
            onChange={(event) => onChange({ ...draft, endsDate: event.target.value })}
          />
        </FormField>
        <FormField label="Time" required>
          <TimeInput
            value={draft.endsTime}
            onChange={(event) => onChange({ ...draft, endsTime: event.target.value })}
          />
        </FormField>
      </div>
      <FormField label="Notes">
        <Textarea
          rows={4}
          value={draft.notes}
          onChange={(event) => onChange({ ...draft, notes: event.target.value })}
          placeholder="Internal notes"
        />
      </FormField>
      {!editing && !allPaid ? (
        <div className="rounded-xl border border-blue-800/70 bg-blue-950/25 p-3">
          <div className="flex items-start gap-2">
            <Forward size={17} className="mt-0.5 shrink-0 text-blue-300" />
            <div>
              <p className="text-sm font-semibold text-blue-100">
                Next: forward and schedule publications
              </p>
              <p className="mt-1 text-xs text-blue-200/70">
                After the folder is created, it opens automatically. Forward
                posts through the system bot and set a publication date and time
                for each one.
              </p>
            </div>
          </div>
        </div>
      ) : null}
      <div className="rounded-xl border border-blue-900/60 bg-blue-950/20 p-3 text-sm text-blue-100">
        Invite links can be used in different folders when their active date
        ranges do not overlap. Joins are measured during each folder period.
        Links reserved by ordinary Ads are unavailable.
      </div>
    </div>
  );
}

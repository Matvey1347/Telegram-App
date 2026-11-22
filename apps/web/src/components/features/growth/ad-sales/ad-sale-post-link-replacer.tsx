"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { Button, FormField, Input } from "@/components/ui/primitives";
import { replaceAdSalePostLinks } from "./ad-sale-post-links";
import type { PlacementManagedPostDraft } from "./placement-post/placement-post-composer";

export function AdSalePostLinkReplacer({
  draft,
  label,
  onReplace,
}: {
  draft: PlacementManagedPostDraft;
  label: string;
  onReplace: (draft: PlacementManagedPostDraft) => void;
}) {
  const [replacement, setReplacement] = useState("");
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <FormField label={label}>
        <Input
          value={replacement}
          onChange={(event) => setReplacement(event.target.value)}
          placeholder="https://example.com/your-link"
        />
      </FormField>
      <Button
        type="button"
        variant="secondary"
        disabled={!replacement.trim()}
        onClick={() => {
          onReplace(replaceAdSalePostLinks(draft, replacement.trim()));
          setReplacement("");
        }}
      >
        <Link2 size={14} aria-hidden="true" />
        Replace links
      </Button>
    </div>
  );
}

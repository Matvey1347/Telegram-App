"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import type { TelegramManagedPost } from "@/lib/api";
import { buildManagedPostsTextExport } from "@/lib/features/telegram/telegram-managed-post-export";

export function ManagedPostExportButton({
  posts,
}: {
  posts: TelegramManagedPost[];
}) {
  const download = () => {
    const blob = new Blob([buildManagedPostsTextExport(posts)], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `telegram-posts-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={!posts.length}
      onClick={download}
      title="Download selected as TXT"
      aria-label="Download selected posts as TXT"
      className="flex h-9 items-center gap-1.5 px-3"
    >
      <Download size={15} />
      TXT
    </Button>
  );
}

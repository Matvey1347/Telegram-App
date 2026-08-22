import { ExternalLink, Radio } from "lucide-react";

export function ManagedPostReadOnlyPanel({
  title,
  telegramUrl,
}: {
  title: string;
  telegramUrl?: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-sky-800/70 bg-sky-950/25 p-4">
        <Radio className="mt-0.5 shrink-0 text-sky-300" size={18} />
        <div className="min-w-0">
          <h2 className="font-semibold text-white">Synced from Telegram</h2>
          <p className="mt-1 text-sm text-sky-100/80">
            “{title}” is a read-only Telegram post. Its content and engagement
            update from channel analytics and cannot be edited, scheduled,
            moved, reordered, or deleted here.
          </p>
        </div>
      </div>
      {telegramUrl ? (
        <a
          href={telegramUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-300 hover:text-blue-200"
        >
          Open original post in Telegram
          <ExternalLink size={14} />
        </a>
      ) : null}
    </div>
  );
}

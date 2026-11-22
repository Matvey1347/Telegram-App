"use client";

export function SourceChip({
  source,
  fallback,
  compact = false,
  href,
  title,
}: {
  source:
    | {
        title?: string | null;
        name?: string | null;
        photoUrl?: string | null;
        imageUrl?: string | null;
      }
    | null
    | undefined;
  fallback?: string;
  compact?: boolean;
  href?: string;
  title?: string;
}) {
  const label = source?.title || source?.name || fallback || "-";
  const content = (
    <>
      {source?.photoUrl || source?.imageUrl ? (
        <img
          src={source.photoUrl || source.imageUrl || undefined}
          alt=""
          className={`${compact ? "h-4 w-4" : "h-5 w-5"} shrink-0 rounded-full object-cover`}
        />
      ) : (
        <span
          className={`${compact ? "h-4 w-4" : "h-5 w-5"} inline-flex shrink-0 items-center justify-center rounded-full border border-slate-700 text-[10px] text-slate-400`}
        >
          {String(label).slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="truncate">{label}</span>
    </>
  );
  if (!href) {
    return (
      <span
        className={`inline-flex items-center gap-2 ${compact ? "max-w-[200px]" : "max-w-[220px]"}`}
        title={title}
      >
        {content}
      </span>
    );
  }
  return (
    <a
      href={href}
      title={title}
      className={`inline-flex items-center gap-2 transition-colors hover:text-white ${compact ? "max-w-[200px]" : "max-w-[220px]"}`}
    >
      {content}
    </a>
  );
}

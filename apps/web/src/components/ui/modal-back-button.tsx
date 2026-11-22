"use client";

import { ArrowLeft } from "lucide-react";

export function ModalBackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex h-9 w-9 min-h-9 min-w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-neutral-700 bg-neutral-700 p-0 text-white transition hover:bg-neutral-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
    >
      <ArrowLeft aria-hidden="true" width={20} height={20} strokeWidth={2.25} className="!h-5 !w-5 shrink-0" />
    </button>
  );
}

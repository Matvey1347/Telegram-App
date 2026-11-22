"use client";

import { useRef, type CSSProperties, type PointerEvent } from "react";

export type AiPostingWatermarkPreviewSettings = {
  enabled: boolean;
  size: number;
  opacity: number;
  legacySize?: number;
  x: number;
  y: number;
  onPositionChange: (x: number, y: number) => void;
};

const percent = (value: number) => Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;

export function AiPostingWatermarkPreview({
  imageUrl,
  avatarUrl,
  settings,
  legacy,
}: {
  imageUrl: string;
  avatarUrl?: string | null;
  legacy?: boolean;
  settings: AiPostingWatermarkPreviewSettings;
}) {
  const area = useRef<HTMLDivElement>(null);
  const grab = useRef({ x: 0, y: 0 });
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || !area.current) return;
    const bounds = area.current.getBoundingClientRect();
    const size = event.currentTarget.getBoundingClientRect();
    settings.onPositionChange(
      percent((event.clientX - bounds.left - grab.current.x) * 100 / Math.max(1, bounds.width - size.width)),
      percent((event.clientY - bounds.top - grab.current.y) * 100 / Math.max(1, bounds.height - size.height)),
    );
  };

  const legacyPatch = legacy && settings.legacySize ? settings.legacySize + 8 : 0;

  return (
    <div className="relative w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="" className="block w-full" />
      {legacyPatch > 0 && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden [container-type:size]">
          {/* Approximate the covered area using the adjacent part of this same photo. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 size-full"
            style={{
              clipPath: `inset(calc(100% - ${legacyPatch * 2}cqmin) 0 ${legacyPatch}cqmin calc(100% - ${legacyPatch}cqmin))`,
              maskImage: `linear-gradient(to right, transparent calc(100% - ${legacyPatch}cqmin), black calc(100% - ${legacyPatch - 2}cqmin)), linear-gradient(to bottom, transparent calc(100% - ${legacyPatch * 2}cqmin), black calc(100% - ${legacyPatch * 2 - 2}cqmin))`,
              maskComposite: "intersect",
              transform: `translateY(${legacyPatch}cqmin)`,
            }}
          />
        </div>
      )}
      {settings.enabled && avatarUrl && (
        <div ref={area} className="pointer-events-none absolute inset-[2%] [container-type:size]">
          <button
            type="button"
            aria-label="Переместить водяной знак"
            className="pointer-events-auto absolute aspect-square touch-none cursor-grab rounded-full border-2 border-white active:cursor-grabbing"
            style={{
              "--watermark-size": `${settings.size}cqmin`,
              width: "var(--watermark-size)",
              left: `calc((100% - ${settings.size}cqmin) * ${settings.x / 100})`,
              top: `calc((100% - ${settings.size}cqmin) * ${settings.y / 100})`,
              opacity: settings.opacity / 100,
            } as CSSProperties}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              const bounds = event.currentTarget.getBoundingClientRect();
              grab.current = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={move}
            onKeyDown={(event) => {
              const offset = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] }[event.key];
              if (!offset) return;
              event.preventDefault();
              settings.onPositionChange(percent(settings.x + offset[0]), percent(settings.y + offset[1]));
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatarUrl} alt="" draggable={false} className="size-full rounded-full object-cover" />
          </button>
        </div>
      )}
    </div>
  );
}

import type { TelegramPostMediaItem } from "@telegram-system/shared";

export function TelegramPostMediaPreview({
  mediaItems,
}: {
  mediaItems: TelegramPostMediaItem[];
}) {
  const visible = mediaItems.slice(0, 4);
  if (visible.length === 1)
    return (
      <div className="w-full bg-[#101b27]">
        <MediaItem item={visible[0]} single />
      </div>
    );
  return (
    <div className="grid grid-cols-2 gap-0.5 bg-[#0e1621]">
      {visible.map((item, index) => (
        <div
          key={`${item.kind}-${item.url}-${index}`}
          className={`relative overflow-hidden bg-[#101b27] ${visible.length === 3 && index === 0 ? "row-span-2 aspect-auto min-h-56" : "aspect-square"}`}
        >
          <MediaItem item={item} />
          {index === 3 && mediaItems.length > 4 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-2xl font-semibold text-white">
              +{mediaItems.length - 4}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function MediaItem({
  item,
  single = false,
}: {
  item: TelegramPostMediaItem;
  single?: boolean;
}) {
  const className = single
    ? "block h-auto max-h-[520px] w-full object-contain"
    : "h-full w-full object-cover";
  if (item.kind === "PHOTO" || item.mimeType === "image/gif") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.url} alt="" className={className} />;
  }
  return (
    <video
      src={item.url}
      className={className}
      controls={item.kind === "VIDEO"}
      autoPlay={item.kind === "ANIMATION"}
      loop={item.kind === "ANIMATION"}
      muted={item.kind === "ANIMATION"}
      playsInline
      preload="metadata"
    />
  );
}

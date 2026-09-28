export type CrmContactChannelName =
  | "Telegram"
  | "Instagram"
  | "WhatsApp"
  | "Threads"
  | "Other";

// Official service marks from the Simple Icons CDN. Keeping the source URL in
// one place gives every CRM surface the same recognisable service avatar.
const serviceLogoUrl: Record<CrmContactChannelName, string> = {
  Telegram: "https://cdn.simpleicons.org/telegram/229ED9",
  Instagram: "https://cdn.simpleicons.org/instagram/E4405F",
  WhatsApp: "https://cdn.simpleicons.org/whatsapp/25D366",
  Threads: "https://cdn.simpleicons.org/threads/FFFFFF",
  Other: "https://cdn.simpleicons.org/link/9CA3AF",
};

export function CrmContactChannelMark({
  channel,
  className = "h-5 w-5",
}: {
  channel: CrmContactChannelName;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 bg-contain bg-center bg-no-repeat ${className}`}
      style={{ backgroundImage: `url("${serviceLogoUrl[channel]}")` }}
    />
  );
}

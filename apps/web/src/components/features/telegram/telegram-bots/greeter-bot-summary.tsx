import { Handshake } from "lucide-react";

export function GreeterBotSummary() {
  return (
    <div className="flex items-center gap-2 text-sm text-neutral-300">
      <Handshake size={16} className="text-amber-200" aria-hidden="true" />
      <span>Join-request automation is ready to configure.</span>
    </div>
  );
}

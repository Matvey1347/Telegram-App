import { CircleCheck, CircleOff } from "lucide-react";

export function LeadSourceStatus({ active, children }: { active: boolean; children: React.ReactNode }) {
  const Icon = active ? CircleCheck : CircleOff;
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${active ? "bg-emerald-950 text-emerald-300" : "bg-neutral-800 text-neutral-300"}`}><Icon size={14} aria-hidden="true" />{children}</span>;
}

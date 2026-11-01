"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useCrmSalesCopy } from "./crm-sales-copy";

/** Only reconstruct a CRM Inbox destination; never forward an arbitrary return URL. */
export function safeInboxReturnPath(value: string | null) {
  if (!value || !value.startsWith("/ad-sales/inbox?") || value.includes("\\")) return null;
  const parsed = new URL(value, "https://internal.invalid");
  if (parsed.pathname !== "/ad-sales/inbox") return null;
  const conversationId = parsed.searchParams.get("conversationId")?.trim();
  if (!conversationId || conversationId.length > 128) return null;
  const params = new URLSearchParams({ conversationId });
  const workspaceId = parsed.searchParams.get("workspaceId")?.trim();
  if (workspaceId && workspaceId.length <= 128) params.set("workspaceId", workspaceId);
  if (parsed.searchParams.get("details") === "1") params.set("details", "1");
  return `/ad-sales/inbox?${params}`;
}
export function CrmSaleReturnLink() {
  const params = useSearchParams();
  const t = useCrmSalesCopy();
  const href = safeInboxReturnPath(params.get("returnTo"));
  return href ? <Link href={href} className="flex min-h-11 items-center gap-2 border-t border-neutral-800 px-4 text-sm text-blue-300"><ArrowLeft size={16} />{t("crmSales.backToInbox")}</Link> : null;
}

"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/primitives";
import { CrmContactActionModal } from "../crm-contact-action-modal";
import { LeadContactPreparations } from "../leads/lead-contact-preparations";
export function ManualClientContext({ contactId }: { contactId: string }) {
  const [action, setAction] = useState<"info" | "deals" | null>(null);
  return (
    <section className="space-y-3 border-t border-neutral-800 pt-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setAction("info")}>
          Client info, notes and source
        </Button>
        <Button variant="secondary" onClick={() => setAction("deals")}>
          Purchases and sales history
        </Button>
      </div>
      <LeadContactPreparations contactId={contactId} />
      <p className="text-xs text-neutral-400">
        No linked permitted advertisement?{" "}
        <Link className="text-blue-300 underline" href="/ad-sales/leads">
          Add reviewed advertising material in AI Leads
        </Link>{" "}
        to prepare an offer explicitly.
      </p>
      {action ? (
        <CrmContactActionModal
          contactId={contactId}
          action={action}
          onClose={() => setAction(null)}
        />
      ) : null}
    </section>
  );
}

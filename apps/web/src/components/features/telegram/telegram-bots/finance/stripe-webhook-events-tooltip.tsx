import { Info } from "lucide-react";
import { Tooltip } from "@/components/ui/primitives";

const STRIPE_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;

export function StripeWebhookSigningSecretLabel({
  configured = false,
}: {
  configured?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>
        Webhook signing secret{configured ? " (configured)" : ""}
      </span>
      <Tooltip
        side="bottom"
        align="left"
        content={
          <span className="block min-w-64">
            <span className="mb-1.5 block font-medium text-white">
              Add these events to the Stripe webhook:
            </span>
            <span className="block space-y-0.5 font-mono text-[11px] text-neutral-300">
              {STRIPE_WEBHOOK_EVENTS.map((event) => (
                <span key={event} className="block">
                  {event}
                </span>
              ))}
            </span>
          </span>
        }
      >
        <button
          type="button"
          className="inline-flex rounded text-neutral-400 hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Show required Stripe webhook events"
        >
          <Info size={15} />
        </button>
      </Tooltip>
    </span>
  );
}

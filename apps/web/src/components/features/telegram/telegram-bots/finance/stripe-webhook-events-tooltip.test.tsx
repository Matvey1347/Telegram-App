import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { StripeWebhookSigningSecretLabel } from "./stripe-webhook-events-tooltip";

describe("StripeWebhookSigningSecretLabel", () => {
  it("shows every Stripe event consumed by the billing webhook", async () => {
    const user = userEvent.setup();
    render(<StripeWebhookSigningSecretLabel />);

    await user.hover(
      screen.getByRole("button", {
        name: "Show required Stripe webhook events",
      }),
    );

    for (const event of [
      "checkout.session.completed",
      "invoice.paid",
      "invoice.payment_failed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ]) {
      expect(await screen.findByText(event)).toBeInTheDocument();
    }
  });
});

import { BadGatewayException, BadRequestException } from '@nestjs/common';
import type Stripe from 'stripe';

export async function createStripePlanChangeSession(
  stripe: Stripe,
  input: {
    customerId: string;
    providerSubscriptionId: string;
    priceId: string;
    returnUrl: string;
  },
) {
  try {
    const [subscription, price] = await Promise.all([
      stripe.subscriptions.retrieve(input.providerSubscriptionId),
      stripe.prices.retrieve(input.priceId),
    ]);
    const item = subscription.items.data[0];
    if (
      subscription.customer !== input.customerId ||
      subscription.status !== 'active' ||
      subscription.schedule ||
      subscription.cancel_at_period_end ||
      subscription.items.data.length !== 1 ||
      item.price.id === price.id ||
      !price.active ||
      !price.recurring
    )
      throw new BadRequestException(
        'Stripe cannot change this subscription to the selected price',
      );

    // Stripe allows only one price per product and interval in a portal configuration.
    // A configuration per target price lets monthly and quarterly prices share a product.
    const name = `groshly-plus-change-v1:${price.id}`;
    const { data: configurations } =
      await stripe.billingPortal.configurations.list({
        active: true,
        limit: 100,
      });
    // Stripe promotes the first configuration in an account to the default.
    if (!configurations.length) {
      await stripe.billingPortal.configurations.create(
        {
          name: 'Groshly billing',
          features: {
            invoice_history: { enabled: true },
            payment_method_update: { enabled: true },
          },
        },
        { idempotencyKey: 'groshly-billing-default-v1' },
      );
    }
    const existing = configurations.find(
      (entry) => entry.metadata?.groshlyPlanChange === name,
    );
    const configuration =
      existing ??
      (await stripe.billingPortal.configurations.create(
        {
          name: 'Groshly Plus',
          metadata: { groshlyPlanChange: name },
          features: {
            payment_method_update: { enabled: true },
            subscription_update: {
              enabled: true,
              default_allowed_updates: ['price'],
              proration_behavior: 'always_invoice',
              products: [
                {
                  product:
                    typeof price.product === 'string'
                      ? price.product
                      : price.product.id,
                  prices: [price.id],
                },
              ],
            },
          },
        },
        { idempotencyKey: name },
      ));
    const session = await stripe.billingPortal.sessions.create({
      customer: input.customerId,
      configuration: configuration.id,
      return_url: input.returnUrl,
      flow_data: {
        type: 'subscription_update_confirm',
        subscription_update_confirm: {
          subscription: subscription.id,
          items: [
            { id: item.id, price: price.id, quantity: item.quantity ?? 1 },
          ],
        },
        after_completion: {
          type: 'redirect',
          redirect: { return_url: input.returnUrl },
        },
      },
    });
    return session.url;
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadGatewayException('Unable to open Stripe plan change');
  }
}

export async function getStripeRenewalPreview(
  stripe: Stripe,
  providerSubscriptionId: string,
) {
  const [subscription, invoice] = await Promise.all([
    stripe.subscriptions.retrieve(providerSubscriptionId),
    stripe.invoices.createPreview({ subscription: providerSubscriptionId }),
  ]);
  const item = subscription.items.data[0];
  const recurring = item?.price.recurring;
  if (
    !recurring ||
    subscription.items.data.length !== 1 ||
    subscription.cancel_at_period_end
  )
    return null;
  return {
    amountMinor: invoice.amount_due,
    currency: invoice.currency.toUpperCase(),
    chargeAt: new Date(
      (invoice.next_payment_attempt ?? item.current_period_end) * 1000,
    ).toISOString(),
    interval: recurring.interval.toUpperCase(),
    intervalCount: recurring.interval_count,
  };
}

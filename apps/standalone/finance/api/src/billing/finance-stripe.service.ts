import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import Stripe from 'stripe';
import { FinanceRuntimeConfig } from '../config/finance-runtime-config';
import { FinanceBillingMode } from '../generated/prisma';

@Injectable()
export class FinanceStripeService {
  constructor(private readonly config: FinanceRuntimeConfig) {}

  mode() {
    if (!this.config.stripeMode) throw new ServiceUnavailableException('Finance billing is not configured');
    return this.config.stripeMode as FinanceBillingMode;
  }

  client(mode: FinanceBillingMode) {
    const key = mode === 'TEST' ? this.config.stripeTestSecretKey : this.config.stripeLiveSecretKey;
    if (!key) throw new ServiceUnavailableException(`Finance Stripe ${mode} is not configured`);
    return new Stripe(key);
  }

  webhook(mode: FinanceBillingMode, rawBody: Buffer | undefined, signature: string | undefined) {
    const secret = mode === 'TEST' ? this.config.stripeTestWebhookSecret : this.config.stripeLiveWebhookSecret;
    if (!secret || !rawBody || !signature) throw new BadRequestException('Stripe signature is required');
    try {
      const event = this.client(mode).webhooks.constructEvent(rawBody, signature, secret);
      if (event.livemode !== (mode === 'LIVE')) throw new Error('mode mismatch');
      return event;
    } catch {
      throw new BadRequestException('Invalid Finance Stripe signature or mode');
    }
  }
}

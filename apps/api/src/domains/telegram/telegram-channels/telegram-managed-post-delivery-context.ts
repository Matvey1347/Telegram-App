import { managedPostDeliveryEligibility } from './managed-post-delivery-eligibility';
import { AsyncLocalStorage } from 'node:async_hooks';
import { PrismaService } from '../../../prisma/prisma.service';

export const managedPostDeliveryContext = new AsyncLocalStorage<{
  postId: string;
  owner: string;
  signal: AbortSignal;
}>();

/** Fences a preflight that resumes after its dispatcher deadline or process lease. */
export async function assertManagedPostDeliveryActive(
  prisma: PrismaService,
  postId: string,
) {
  const context = managedPostDeliveryContext.getStore();
  if (!context) return;
  context.signal.throwIfAborted();
  if (context.postId !== postId)
    throw new Error('Publication context mismatch');
  const owned = await prisma.telegramManagedPost.count({
    where: {
      id: postId,
      status: 'PUBLISHING',
      AND: [managedPostDeliveryEligibility(new Date())],
      deliveryClaimOwner: context.owner,
      deliveryClaimExpiresAt: { gt: new Date() },
    },
  });
  context.signal.throwIfAborted();
  if (owned !== 1)
    throw new Error('Publication ownership expired before dispatch');
}

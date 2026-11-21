import { AsyncLocalStorage } from 'node:async_hooks';

export const recoveryAuthorization = new AsyncLocalStorage<string>();
export const recoveryAccountMarker = 'local-recovery-account';
export const productionOperatorRequest = new AsyncLocalStorage<{
  signal: AbortSignal;
  postId?: string;
  placementId?: string;
  acknowledgedActor?: { id: string; type: string };
  remainingAckOrdinals?: Set<number>;
}>();

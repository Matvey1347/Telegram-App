import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ScheduledTaskLockService } from '../../operations/scheduled-tasks/scheduled-task-lock.service';

// A StringSession is an MTProto authorization key, not a reconnectable socket
// credential. Telegram revokes it when two API instances connect with it at
// once. This one shared lease makes the CRM live runtime single-instance while
// preserving failover after a bounded expiry.
const LEASE_KEY = 'telegram-crm-runtime';
const LEASE_TTL_MS = 90_000;
const LEASE_RENEWAL_MS = 30_000;

@Injectable()
export class TelegramCrmRuntimeLeaseService {
  private readonly ownerId = randomUUID();
  private renewalTimer?: NodeJS.Timeout;
  private ownsLease = false;

  constructor(private readonly locks: ScheduledTaskLockService) {}

  async acquire() {
    if (this.ownsLease) return true;
    const acquired = await this.locks.acquire({
      lockKey: LEASE_KEY,
      taskKey: LEASE_KEY,
      workspaceId: null,
      ownerId: this.ownerId,
      ttlMs: LEASE_TTL_MS,
    });
    this.ownsLease = acquired;
    return acquired;
  }

  startRenewing(onLost: () => void) {
    if (!this.ownsLease || this.renewalTimer) return;
    this.renewalTimer = setInterval(() => {
      void this.renew(onLost);
    }, LEASE_RENEWAL_MS);
    this.renewalTimer.unref?.();
  }

  async release() {
    if (this.renewalTimer) clearInterval(this.renewalTimer);
    this.renewalTimer = undefined;
    if (!this.ownsLease) return;
    this.ownsLease = false;
    await this.locks.release(LEASE_KEY, this.ownerId);
  }

  private async renew(onLost: () => void) {
    if (!this.ownsLease) return;
    try {
      const renewal = await this.locks.renew(
        LEASE_KEY,
        this.ownerId,
        LEASE_TTL_MS,
      );
      if (renewal.count === 1) return;
    } catch {
      // A database failure means we can no longer prove exclusive ownership.
    }
    this.ownsLease = false;
    if (this.renewalTimer) clearInterval(this.renewalTimer);
    this.renewalTimer = undefined;
    onLost();
  }
}

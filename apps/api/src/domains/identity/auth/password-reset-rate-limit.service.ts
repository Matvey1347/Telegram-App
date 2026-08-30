import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

type Attempt = { count: number; resetAt: number };

const WINDOW_MS = 15 * 60 * 1000;
const MAX_KEYS = 10_000;
const CLEANUP_BATCH = 32;

@Injectable()
export class PasswordResetRateLimitService {
  private readonly attempts = new Map<string, Attempt>();

  checkForgot(ip: string | undefined, email: string) {
    const account = email.toLowerCase().trim();
    this.consume(`forgot:ip:${ip || 'unknown'}`, 5);
    this.consume(`forgot:account:${this.digest(account)}`, 3);
  }

  checkReset(ip: string | undefined, token: string) {
    this.consume(`reset:ip:${ip || 'unknown'}`, 20);
    this.consume(`reset:token:${this.digest(token)}`, 5);
  }

  private consume(key: string, limit: number) {
    const now = Date.now();
    this.cleanup(now);
    const current = this.attempts.get(key);
    if (!current || current.resetAt <= now) {
      this.setBounded(key, { count: 1, resetAt: now + WINDOW_MS });
      return;
    }
    if (current.count >= limit) {
      throw new HttpException(
        { message: 'Too many attempts. Please try again later.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    current.count += 1;
  }

  private cleanup(now: number) {
    if (this.attempts.size === 0) return;
    let checked = 0;
    for (const [key, attempt] of this.attempts) {
      if (checked >= CLEANUP_BATCH) break;
      if (attempt.resetAt <= now) this.attempts.delete(key);
      checked += 1;
    }
  }

  private setBounded(key: string, attempt: Attempt) {
    if (this.attempts.size >= MAX_KEYS) {
      const oldestKey = this.attempts.keys().next().value as string | undefined;
      if (oldestKey) this.attempts.delete(oldestKey);
    }
    this.attempts.set(key, attempt);
  }

  private digest(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}

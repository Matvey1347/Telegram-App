import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { PasswordResetEmailService } from './password-reset-email.service';
import { badRequest } from '../../../common/http/structured-http-error';

const REQUEST_ACCEPTED = {
  message: 'If an account exists for that email, a reset link has been sent.',
};
const TOKEN_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: PasswordResetEmailService,
  ) {}

  async request(inputEmail: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: inputEmail.toLowerCase().trim() },
      select: { id: true, email: true, locale: true },
    });
    if (!user) return REQUEST_ACCEPTED;

    const rawToken = randomBytes(32).toString('base64url');
    await this.prisma.passwordResetToken.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
      update: {
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
        usedAt: null,
      },
    });

    try {
      await this.email.send(user.email, rawToken, user.locale);
    } catch {
      // The public response stays identical so SMTP health cannot enumerate users.
      this.logger.error('Password reset email delivery failed');
    }
    return REQUEST_ACCEPTED;
  }

  async reset(
    rawToken: string,
    password: string,
  ): Promise<{ message: string }> {
    const tokenHash = this.hashToken(rawToken);
    const candidate = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, usedAt: true, expiresAt: true },
    });
    if (!candidate || candidate.usedAt || candidate.expiresAt <= new Date()) {
      throw badRequest(
        'AUTH_RESET_TOKEN_INVALID',
        'Reset token is invalid or expired',
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const changed = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: {
          id: candidate.id,
          tokenHash,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { usedAt: new Date() },
      });
      if (claimed.count !== 1) return false;

      await tx.user.update({
        where: { id: candidate.userId },
        data: { passwordHash, authVersion: { increment: 1 } },
      });
      return true;
    });

    if (!changed) {
      throw badRequest(
        'AUTH_RESET_TOKEN_INVALID',
        'Reset token is invalid or expired',
      );
    }
    return { message: 'Password has been reset.' };
  }

  private hashToken(rawToken: string) {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}

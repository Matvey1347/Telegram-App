import { BadRequestException, Injectable } from '@nestjs/common';
import {
  Prisma,
  TelegramAdvertiserContactType,
  TelegramCrmContactStage,
} from '@prisma/client';

type AdvertiserInput = {
  advertiserId?: string | null;
  advertiserName: string;
  advertiserTelegram?: string | null;
  advertiserContact?: string | null;
  advertiserCompanyName?: string | null;
  createAdvertiser?: boolean;
};

type ExistingAdvertiser = {
  id: string;
  displayName: string;
  telegramUsername: string | null;
  companyName: string | null;
};

@Injectable()
export class TelegramAdvertiserCheckoutResolverService {
  async resolve(
    tx: Prisma.TransactionClient,
    input: AdvertiserInput,
    context: {
      workspaceId: string;
      userId: string;
      ownerMemberId: string | null;
      selected: ExistingAdvertiser | null;
    },
  ): Promise<ExistingAdvertiser | null> {
    if (context.selected) return context.selected;
    if (!input.createAdvertiser) return null;

    const username = this.usernameFromInput(input);
    if (username) {
      const contact = await tx.telegramAdvertiserContact.findFirst({
        where: {
          workspaceId: context.workspaceId,
          type: TelegramAdvertiserContactType.TELEGRAM_USERNAME,
          normalizedValue: username,
        },
        select: {
          advertiser: {
            select: {
              id: true,
              displayName: true,
              telegramUsername: true,
              companyName: true,
            },
          },
        },
      });
      if (contact?.advertiser) return contact.advertiser;
      const legacy = await tx.telegramAdvertiser.findFirst({
        where: {
          workspaceId: context.workspaceId,
          telegramUsername: { equals: username, mode: 'insensitive' },
        },
        select: {
          id: true,
          displayName: true,
          telegramUsername: true,
          companyName: true,
        },
      });
      if (legacy) return legacy;
    }

    const created = await tx.telegramAdvertiser.create({
      data: {
        workspaceId: context.workspaceId,
        displayName: input.advertiserName.trim(),
        companyName: input.advertiserCompanyName?.trim() || null,
        telegramUsername: username,
        phone: this.normalizePhone(input.advertiserContact),
        email: this.normalizeEmail(input.advertiserContact),
        ownerMemberId: context.ownerMemberId,
        createdByUserId: context.userId,
        stage: TelegramCrmContactStage.NEW,
      },
      select: {
        id: true,
        displayName: true,
        telegramUsername: true,
        companyName: true,
      },
    });
    if (username) {
      await tx.telegramAdvertiserContact.create({
        data: {
          workspaceId: context.workspaceId,
          advertiserId: created.id,
          type: TelegramAdvertiserContactType.TELEGRAM_USERNAME,
          value:
            input.advertiserTelegram?.trim() ||
            input.advertiserContact?.trim() ||
            username,
          normalizedValue: username,
          isPrimary: true,
        },
      });
    }
    return created;
  }

  private usernameFromInput(input: AdvertiserInput) {
    const explicit = input.advertiserTelegram?.trim();
    if (explicit) return this.normalizeUsernameOrThrow(explicit);
    const contact = input.advertiserContact?.trim();
    if (contact && /^@?[a-z\d_]{5,32}$/i.test(contact)) {
      return this.normalizeUsername(contact);
    }
    if (/^@[a-z\d_]{5,32}$/i.test(input.advertiserName.trim())) {
      return this.normalizeUsername(input.advertiserName);
    }
    if (
      contact &&
      (contact.startsWith('@') || /[a-z_]/i.test(contact)) &&
      !contact.includes('@', 1)
    ) {
      throw new BadRequestException(
        'Telegram username must contain 5-32 letters, numbers, or underscores',
      );
    }
    return null;
  }

  private normalizeUsernameOrThrow(value: string) {
    const username = value.trim().replace(/^@+/, '');
    if (!/^[a-z\d_]{5,32}$/i.test(username)) {
      throw new BadRequestException(
        'Telegram username must contain 5-32 letters, numbers, or underscores',
      );
    }
    return username.toLowerCase();
  }

  private normalizeUsername(value: string) {
    return value.trim().replace(/^@+/, '').toLowerCase();
  }

  private normalizePhone(value?: string | null) {
    if (!value || value.includes('@') || /[a-z_]/i.test(value)) return null;
    return value.trim().replace(/[^\d+]/g, '') || null;
  }

  private normalizeEmail(value?: string | null) {
    return value?.includes('@') && !value.trim().startsWith('@')
      ? value.trim().toLowerCase()
      : null;
  }
}

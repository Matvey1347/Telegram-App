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
    const contact = this.contactFromInput(input, username);
    if (username || contact) {
      const where = username
        ? {
            type: TelegramAdvertiserContactType.TELEGRAM_USERNAME,
            normalizedValue: username,
          }
        : contact!;
      const matchedContact = await tx.telegramAdvertiserContact.findFirst({
        where: {
          workspaceId: context.workspaceId,
          ...where,
        },
        select: {
          type: true,
          normalizedValue: true,
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
      if (matchedContact?.advertiser) return matchedContact.advertiser;
      const legacy = await tx.telegramAdvertiser.findFirst({
        where: {
          workspaceId: context.workspaceId,
          ...(username
            ? { telegramUsername: { equals: username, mode: 'insensitive' } }
            : contact?.type === TelegramAdvertiserContactType.PHONE
              ? { phone: contact.normalizedValue }
              : {
                  email: {
                    equals: contact!.normalizedValue,
                    mode: 'insensitive',
                  },
                }),
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
    if (username || contact) {
      await tx.telegramAdvertiserContact.create({
        data: {
          workspaceId: context.workspaceId,
          advertiserId: created.id,
          type: username
            ? TelegramAdvertiserContactType.TELEGRAM_USERNAME
            : contact!.type,
          value: username
            ? input.advertiserTelegram?.trim() ||
              input.advertiserContact?.trim() ||
              username
            : input.advertiserContact!.trim(),
          normalizedValue: username ?? contact!.normalizedValue,
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

  private contactFromInput(input: AdvertiserInput, username: string | null) {
    if (username) return null;
    const phone = this.normalizePhone(input.advertiserContact);
    if (phone) {
      return {
        type: TelegramAdvertiserContactType.PHONE,
        normalizedValue: phone,
      };
    }
    const email = this.normalizeEmail(input.advertiserContact);
    return email
      ? { type: TelegramAdvertiserContactType.EMAIL, normalizedValue: email }
      : null;
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

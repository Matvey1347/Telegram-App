import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  addCrmContactMethod,
  updateCrmContactMethod,
} from './telegram-ad-sales-crm-contact-methods';
import { instagramIdentity } from '../telegram-crm/telegram-crm-instagram-identity.service';
function fixture() {
  const row = {
    id: 'method',
    workspaceId: 'workspace',
    advertiserId: 'client',
    type: 'INSTAGRAM',
    value: '@old.profile',
    normalizedValue: 'old.profile',
    identityState: 'ACTIVE',
    isPrimary: false,
    isVerified: false,
    ownershipConfirmedAt: new Date(),
    ownershipConfirmedByUserId: 'user',
    label: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const tx = {
    $queryRaw: jest.fn(),
    telegramAdvertiserContact: {
      findFirst: jest.fn().mockResolvedValue(row),
      updateMany: jest.fn(),
      create: jest.fn().mockImplementation(({ data }: { data: object }) => ({
        ...row,
        ...data,
      })),
      update: jest.fn().mockImplementation(({ data }: { data: object }) => ({
        ...row,
        ...data,
      })),
    },
    telegramAdvertiserActivity: { create: jest.fn() },
  };
  const context = {
    prisma: {
      $transaction: (fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
    } as never,
    workspaceId: 'workspace',
    advertiserId: 'client',
    userId: 'user',
    normalize: (_type: unknown, value: string) =>
      instagramIdentity(value).username,
    authorize: jest.fn().mockResolvedValue('workspace'),
  };
  return { tx, context };
}
describe('legacy Sales typed Instagram methods', () => {
  it('normalizes raw input and ignores caller verified flag', async () => {
    const f = fixture();
    const result = await addCrmContactMethod(f.context, {
      type: 'INSTAGRAM',
      value: ' @Business.Profile ',
      isVerified: true,
    });
    expect(result).toMatchObject({
      value: ' @Business.Profile ',
      normalizedValue: 'business.profile',
      isVerified: false,
      instagram: {
        profileVerification: 'UNVERIFIED',
        profileUrl: 'https://www.instagram.com/business.profile/',
      },
    });
    expect(f.context.authorize).toHaveBeenCalled();
  });
  it('clears ownership on rename and records compact old/new identity', async () => {
    const f = fixture();
    const result = await updateCrmContactMethod(f.context, 'method', {
      value: '@new.profile',
      isVerified: true,
    });
    expect(result).toMatchObject({
      normalizedValue: 'new.profile',
      ownershipConfirmedAt: null,
      isVerified: false,
    });
    expect(f.tx.telegramAdvertiserActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          previousUsername: 'old.profile',
          username: 'new.profile',
          channel: 'INSTAGRAM',
        }) as unknown,
      }) as unknown,
    });
  });
  it('rejects a duplicate with409 and respects ownership authorization before any writes', async () => {
    const f = fixture();
    f.tx.telegramAdvertiserContact.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      addCrmContactMethod(f.context, {
        type: 'INSTAGRAM',
        value: '@duplicate',
      }),
    ).rejects.toThrow('INSTAGRAM_IDENTITY_ALREADY_LINKED');
    f.context.authorize.mockRejectedValue(new ForbiddenException());
    f.tx.telegramAdvertiserContact.create.mockClear();
    await expect(
      addCrmContactMethod(f.context, { type: 'INSTAGRAM', value: '@another' }),
    ).rejects.toThrow(ForbiddenException);
    expect(f.tx.telegramAdvertiserContact.create).not.toHaveBeenCalled();
  });
});

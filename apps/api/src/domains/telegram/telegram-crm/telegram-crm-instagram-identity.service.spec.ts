import {
  TelegramCrmInstagramIdentityService,
  instagramIdentity,
  mapInstagramMethod,
} from './telegram-crm-instagram-identity.service';
function fixture() {
  let row: Record<string, unknown> | null = null;
  const tx = {
    $queryRaw: jest.fn(),
    telegramAdvertiser: {
      findFirst: jest.fn().mockResolvedValue({ id: 'client' }),
    },
    telegramAdvertiserContact: {
      findFirst: jest.fn(({ where }: { where: { id?: string } }) =>
        where.id && typeof where.id === 'string' ? row : null,
      ),
      updateMany: jest.fn(),
      create: jest.fn(
        ({ data }: { data: object }) => (row = { id: 'method', ...data }),
      ),
      update: jest.fn(
        ({ data }: { data: object }) => (row = { ...row, ...data }),
      ),
    },
    telegramAdvertiserActivity: { create: jest.fn() },
  };
  const scope = { workspaceId: 'workspace' };
  const crm = {
    readScope: jest.fn().mockResolvedValue(scope),
    editScope: jest.fn().mockResolvedValue(scope),
  };
  const service = new TelegramCrmInstagramIdentityService(
    {
      $transaction: (fn: (tx: unknown) => unknown) => Promise.resolve(fn(tx)),
    } as never,
    crm as never,
  );
  return {
    service,
    tx,
    setRow: (value: Record<string, unknown>) => {
      row = value;
    },
    getRow: () => row,
  };
}
describe('canonical manual Instagram identity', () => {
  it('preserves raw spelling and canonicalizes a safe URL without claiming existence', async () => {
    const f = fixture();
    await f.service.write('user', 'client', {
      value: ' @Business.Profile ',
      ownershipConfirmed: true,
    });
    const row = f.getRow();
    expect(row).toMatchObject({
      value: ' @Business.Profile ',
      normalizedValue: 'business.profile',
      isVerified: false,
      ownershipConfirmedByUserId: 'user',
    });
    expect(mapInstagramMethod(row as never)).toMatchObject({
      profileUrl: 'https://www.instagram.com/business.profile/',
      profileVerification: 'UNVERIFIED',
      ownershipConfirmed: true,
    });
    expect(f.tx.telegramAdvertiserActivity.create).toHaveBeenCalledTimes(1);
    await f.service.write(
      'user',
      'client',
      { value: ' @Business.Profile ', ownershipConfirmed: true },
      'method',
    );
    expect(f.tx.telegramAdvertiserContact.update).not.toHaveBeenCalled();
  });
  it('resets ownership on rename and requires a second explicit confirmation', async () => {
    const f = fixture();
    f.setRow({
      id: 'method',
      type: 'INSTAGRAM',
      value: '@old.profile',
      normalizedValue: 'old.profile',
      identityState: 'ACTIVE',
      isPrimary: false,
      isVerified: false,
      ownershipConfirmedAt: new Date(),
      ownershipConfirmedByUserId: 'user',
    });
    await f.service.write(
      'user',
      'client',
      { value: '@new.profile', ownershipConfirmed: true },
      'method',
    );
    expect(f.getRow()).toMatchObject({
      normalizedValue: 'new.profile',
      ownershipConfirmedAt: null,
      ownershipConfirmedByUserId: null,
    });
    await f.service.write(
      'user',
      'client',
      { value: '@new.profile', ownershipConfirmed: true },
      'method',
    );
    expect(f.getRow()?.ownershipConfirmedAt).toBeInstanceOf(Date);
  });
  it('does not silently merge an existing identity or disclose its owner', async () => {
    const f = fixture();
    f.tx.telegramAdvertiserContact.findFirst.mockReturnValue({
      id: 'other',
    });
    await expect(
      f.service.write('user', 'client', {
        value: '@existing',
        ownershipConfirmed: true,
      }),
    ).rejects.toThrow('INSTAGRAM_IDENTITY_ALREADY_LINKED');
    expect(f.tx.telegramAdvertiserContact.create).not.toHaveBeenCalled();
  });
  it.each([
    'https://instagram.com/p/post',
    'https://instagram.com.attacker.org/profile',
    'https://user:secret@instagram.com/profile',
    'http://instagram.com/profile',
    'javascript:alert(1)',
    'https://instagram.com/profile/extra',
  ])('rejects unsafe/non-profile value %s', (value) => {
    expect(() => instagramIdentity(value)).toThrow('INSTAGRAM_PROFILE_INVALID');
  });
  it('rejects writes when current scoped owner cannot be read in the transaction', async () => {
    const f = fixture();
    f.tx.telegramAdvertiser.findFirst.mockResolvedValue(null);
    await expect(
      f.service.write('user', 'other-client', {
        value: '@profile',
        ownershipConfirmed: true,
      }),
    ).rejects.toThrow('CRM Contact not found');
    expect(f.tx.telegramAdvertiserContact.create).not.toHaveBeenCalled();
  });
  it('does not overwrite a Telegram method through the Instagram endpoint', async () => {
    const f = fixture();
    f.setRow({
      id: 'method',
      type: 'TELEGRAM_USER_ID',
      value: '123456',
      label: null,
    });
    await expect(
      f.service.write(
        'user',
        'client',
        { value: '@profile', ownershipConfirmed: true },
        'method',
      ),
    ).rejects.toThrow('INSTAGRAM_METHOD_TYPE_CHANGE_NOT_ALLOWED');
    expect(f.tx.telegramAdvertiserContact.update).not.toHaveBeenCalled();
  });
});

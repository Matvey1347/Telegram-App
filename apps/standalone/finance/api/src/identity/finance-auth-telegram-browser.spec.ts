import { createHmac } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { FinanceAuthService } from './finance-auth.service';
import { FinanceSessionService } from './finance-session.service';

const token = '123456:finance-test-bot-token';
const config = {
  sessionSigningKey: 'finance-session-signing-key-long-enough',
  bootstrapSigningKey: 'finance-bootstrap-signing-key-long-enough',
  webPublicUrl: 'https://finance.example',
  botForEnvironment: () => ({ token }),
} as any;
const prisma = {
  financeBot: { findUnique: jest.fn().mockResolvedValue({ runtimeEnvironment: 'LOCAL' }) },
  financeTelegramUser: { upsert: jest.fn().mockResolvedValue({ id: 'user-1' }) },
  financeProfile: { upsert: jest.fn().mockResolvedValue({ id: 'profile-1' }) },
} as any;
function initData(userId: number, authDate = Math.floor(Date.now() / 1000)) {
  const params = new URLSearchParams({ auth_date: String(authDate), user: JSON.stringify({ id: userId }) });
  const checkString = [...params.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([key,value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', createHmac('sha256', secret).update(checkString).digest('hex'));
  return params.toString();
}
describe('Finance Telegram browser session', () => {
  const sessions = new FinanceSessionService(config);
  const auth = new FinanceAuthService(prisma, sessions, config);
  beforeEach(() => jest.clearAllMocks());
  it('issues a scoped cookie-compatible session for signed current initData', async () => {
    const session = await auth.telegramBrowserSession({ financeBotId: 'bot-1', initData: initData(24680) });
    const subject = sessions.authenticateBrowser(undefined, `finance_session=${session}`, 'https://finance.example', 'bot-1', true);
    expect(subject).toMatchObject({ profileId: 'profile-1', surface: 'TELEGRAM_MINI_APP' });
    expect(() => sessions.assertExternalCheckout(subject)).toThrow(ForbiddenException);
    expect(prisma.financeTelegramUser.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ telegramUserId: '24680' }) }));
  });
  it('rejects tampering, expiry and cross-site cookie mutation', async () => {
    await expect(auth.telegramBrowserSession({ financeBotId: 'bot-1', initData: initData(123).replace('123', '999') })).rejects.toThrow(ForbiddenException);
    await expect(auth.telegramBrowserSession({ financeBotId: 'bot-1', initData: initData(123, Math.floor(Date.now()/1000)-400) })).rejects.toThrow(ForbiddenException);
    const session = sessions.issue({ financeBotId: 'bot-1', financeTelegramUserId: 'user-1', profileId: 'profile-1' });
    expect(() => sessions.authenticateBrowser(undefined, `finance_session=${session}`, 'https://attacker.example', 'bot-1', true)).toThrow(ForbiddenException);
  });
});

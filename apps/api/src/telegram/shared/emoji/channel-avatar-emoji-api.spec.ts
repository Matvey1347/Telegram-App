import { TelegramSystemBotConfigService } from '@api/domains/telegram/telegram-system-bot/telegram-system-bot-config.service';
import { ConfigService } from '@nestjs/config';
import {
  TelegramBotApiClient,
  TelegramBotApiError,
} from '../bot/telegram-bot-api.client';
import {
  AvatarEmojiApiError,
  ChannelAvatarEmojiApi,
} from './channel-avatar-emoji-api';

describe('ChannelAvatarEmojiApi', () => {
  const configuration = {
    TELEGRAM_SYSTEM_BOT_ENVIRONMENT: 'LOCAL',
    TELEGRAM_SYSTEM_BOT_LOCAL_TOKEN: 'private-test-token',
    TELEGRAM_AVATAR_EMOJI_OWNER_USER_ID: '8493027',
    TELEGRAM_SYSTEM_BOT_LOCAL_USERNAME: '@ChannelAvatarBot',
  };
  const setup = (values: Record<string, string> = configuration) => {
    const bot = new TelegramBotApiClient();
    jest.spyOn(bot, 'getMe').mockResolvedValue({
      id: 123,
      username: values.TELEGRAM_SYSTEM_BOT_LOCAL_USERNAME?.replace(/^@/, ''),
    });
    return {
      bot,
      api: new ChannelAvatarEmojiApi(
        new ConfigService(values),
        bot,
        new TelegramSystemBotConfigService(new ConfigService(values)),
      ),
    };
  };
  afterEach(() => jest.restoreAllMocks());

  it('disables incomplete configuration and validates pack sequences', () => {
    const { api } = setup({
      ...configuration,
      TELEGRAM_AVATAR_EMOJI_OWNER_USER_ID: 'invalid',
    });
    expect(api.configured()).toBe(false);
    expect(() => api.packName(1)).toThrow('not configured');
    expect(() => setup().api.packName(0)).toThrow('Invalid');
    expect(() => setup().api.packName(1.2)).toThrow('Invalid');
  });

  it('creates deterministic bot-scoped valid names within Telegram length limits', () => {
    const { api } = setup();
    expect(api.packName(1)).toBe('channelavatars1_by_channelavatarbot');
    expect(api.packName(2)).not.toBe(api.packName(1));
    const longest = setup({
      ...configuration,
      TELEGRAM_SYSTEM_BOT_LOCAL_USERNAME: 'a'.repeat(32),
    });
    expect(
      longest.api.packName(Number.MAX_SAFE_INTEGER).length,
    ).toBeLessThanOrEqual(64);
  });

  it('isolates LOCAL and PRODUCTION credentials and content namespaces', async () => {
    const local = setup({
      ...configuration,
      TELEGRAM_SYSTEM_BOT_PRODUCTION_TOKEN: 'production-test-token',
      TELEGRAM_SYSTEM_BOT_PRODUCTION_USERNAME: 'ProductionBot',
    });
    expect(local.api.assetKey('image')).toBe('local:channelavatarbot:image');
    const values = {
      ...configuration,
      TELEGRAM_SYSTEM_BOT_ENVIRONMENT: 'PRODUCTION',
      TELEGRAM_SYSTEM_BOT_PRODUCTION_TOKEN: 'production-test-token',
      TELEGRAM_SYSTEM_BOT_PRODUCTION_USERNAME: 'ProductionBot',
    };
    const bot = new TelegramBotApiClient();
    jest
      .spyOn(bot, 'getMe')
      .mockResolvedValue({ id: 234, username: 'ProductionBot' });
    const call = jest.spyOn(bot, 'call').mockResolvedValue(true);
    const api = new ChannelAvatarEmojiApi(
      new ConfigService(values),
      bot,
      new TelegramSystemBotConfigService(new ConfigService(values)),
    );
    expect(api.assetKey('image')).toBe('production:productionbot:image');
    await api.createPack(api.packName(1), 'file');
    expect(call).toHaveBeenCalledWith(
      'production-test-token',
      'createNewStickerSet',
      expect.any(Object),
    );
    expect(
      setup({
        ...configuration,
        TELEGRAM_SYSTEM_BOT_PRODUCTION_TOKEN:
          configuration.TELEGRAM_SYSTEM_BOT_LOCAL_TOKEN,
      }).api.configured(),
    ).toBe(false);
    expect(
      setup({
        ...configuration,
        TELEGRAM_SYSTEM_BOT_ENVIRONMENT: '',
      }).api.configured(),
    ).toBe(false);
  });

  it('refuses username/token mismatch and mutation of another bot pack', async () => {
    const { api, bot } = setup();
    jest
      .spyOn(bot, 'getMe')
      .mockResolvedValue({ id: 234, username: 'WrongBot' });
    const call = jest.spyOn(bot, 'call');
    await expect(api.createPack(api.packName(1), 'file')).rejects.toThrow(
      'does not match',
    );
    await expect(api.addToPack('old_by_dedicatedbot', 'file')).rejects.toThrow(
      'another bot',
    );
    expect(call).not.toHaveBeenCalled();
  });

  it('uploads a static PNG as multipart and returns both durable file identifiers', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: { file_id: 'uploaded-file', file_unique_id: 'unique-file' },
        }),
      ),
    );
    const { api } = setup();
    await expect(api.upload(Buffer.from('png-image'))).resolves.toEqual({
      fileId: 'uploaded-file',
      fileUniqueId: 'unique-file',
    });
    const init = fetch.mock.calls[0][1]!;
    const form = init.body as FormData;
    expect(form.get('sticker_format')).toBe('static');
    expect(form.get('user_id')).toBe(
      configuration.TELEGRAM_AVATAR_EMOJI_OWNER_USER_ID,
    );
    expect(await (form.get('sticker') as Blob).text()).toBe('png-image');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('preserves explicit upload rate limits without exposing server error text', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          error_code: 429,
          description: configuration.TELEGRAM_SYSTEM_BOT_LOCAL_TOKEN,
          parameters: { retry_after: 42 },
        }),
        { status: 429 },
      ),
    );
    await expect(setup().api.upload(Buffer.from('png'))).rejects.toMatchObject({
      retryAfterSeconds: 42,
      explicitRejected: true,
      errorCode: 429,
      message: 'Telegram avatar emoji upload failed. Retry the operation.',
    });
  });

  it('sanitizes ambiguous network timeouts and never retries uploads blindly', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(
        new Error(
          `https://api.telegram.org/bot${configuration.TELEGRAM_SYSTEM_BOT_LOCAL_TOKEN}/uploadStickerFile`,
        ),
      );
    const error = await setup()
      .api.upload(Buffer.from('png'))
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(AvatarEmojiApiError);
    expect(String(error)).not.toContain(
      configuration.TELEGRAM_SYSTEM_BOT_LOCAL_TOKEN,
    );
    expect(error).toMatchObject({ explicitRejected: false });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns empty only for an explicit missing sticker set and propagates lookup failures', async () => {
    const { bot, api } = setup();
    const call = jest
      .spyOn(bot, 'call')
      .mockRejectedValue(
        new TelegramBotApiError(
          'Bad Request: STICKERSET_INVALID',
          'PERMANENT',
          { explicitRejected: true, errorCode: 400 },
        ),
      );
    await expect(api.getPack('missing-pack')).resolves.toEqual([]);
    call.mockRejectedValue(
      new TelegramBotApiError('Too Many Requests', 'TRANSIENT', {
        explicitRejected: true,
        errorCode: 429,
        retryAfterSeconds: 16,
      }),
    );
    await expect(api.getPack('existing-pack')).rejects.toMatchObject({
      retryAfterSeconds: 16,
    });
    call.mockRejectedValue(new Error('STICKERSET_INVALID'));
    await expect(api.getPack('ambiguous-pack')).rejects.toBeInstanceOf(
      AvatarEmojiApiError,
    );
  });

  it('maps actual custom emoji identifiers and rejects a regular sticker pack', async () => {
    const { bot, api } = setup();
    const call = jest.spyOn(bot, 'call').mockResolvedValue({
      sticker_type: 'custom_emoji',
      stickers: [
        {
          file_id: 'telegram-file',
          file_unique_id: 'telegram-unique',
          custom_emoji_id: '5893023456789',
        },
      ],
    });
    await expect(api.getPack('custom-pack')).resolves.toEqual([
      {
        fileId: 'telegram-file',
        fileUniqueId: 'telegram-unique',
        customEmojiId: '5893023456789',
      },
    ]);
    call.mockResolvedValue({ sticker_type: 'regular', stickers: [] });
    await expect(api.getPack('wrong-pack')).rejects.toThrow('unexpected type');
  });

  it('uses the shared Bot API transport for create and append with custom emoji semantics', async () => {
    const { bot, api } = setup();
    const call = jest.spyOn(bot, 'call').mockResolvedValue(true);
    await api.createPack('system-pack_by_channelavatarbot', 'first-file');
    await api.addToPack('system-pack_by_channelavatarbot', 'next-file');
    expect(call.mock.calls[0].slice(1)).toEqual([
      'createNewStickerSet',
      {
        user_id: Number(configuration.TELEGRAM_AVATAR_EMOJI_OWNER_USER_ID),
        name: 'system-pack_by_channelavatarbot',
        title: 'Channel avatars',
        sticker_type: 'custom_emoji',
        needs_repainting: false,
        stickers: [
          { sticker: 'first-file', format: 'static', emoji_list: ['📣'] },
        ],
      },
    ]);
    expect(call.mock.calls[1].slice(1)).toEqual([
      'addStickerToSet',
      {
        user_id: Number(configuration.TELEGRAM_AVATAR_EMOJI_OWNER_USER_ID),
        name: 'system-pack_by_channelavatarbot',
        sticker: { sticker: 'next-file', format: 'static', emoji_list: ['📣'] },
      },
    ]);
  });

  it.each(['createPack', 'addToPack'] as const)(
    'sanitizes %s failures and preserves the retry deadline',
    async (operation) => {
      const { bot, api } = setup();
      jest.spyOn(bot, 'call').mockRejectedValue(
        new TelegramBotApiError(
          configuration.TELEGRAM_SYSTEM_BOT_LOCAL_TOKEN,
          'TRANSIENT',
          {
            explicitRejected: true,
            errorCode: 429,
            retryAfterSeconds: 71,
          },
        ),
      );
      const error = await api[operation](
        'system-pack_by_channelavatarbot',
        'file',
      ).catch((error: unknown) => error);
      expect(error).toMatchObject({
        retryAfterSeconds: 71,
        explicitRejected: true,
        errorCode: 429,
      });
      expect(String(error)).not.toContain(
        configuration.TELEGRAM_SYSTEM_BOT_LOCAL_TOKEN,
      );
    },
  );
});

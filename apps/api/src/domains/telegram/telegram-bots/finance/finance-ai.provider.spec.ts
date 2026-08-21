import { BadRequestException } from '@nestjs/common';
import { FinanceAiProviderService } from './finance-ai.provider';

describe('FinanceAiProviderService voice transcription', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function createService(options?: { fileSize?: number; text?: string }) {
    const prisma = {
      financeProfile: {
        findUnique: jest.fn().mockResolvedValue({
          botIntegration: { workspaceId: 'workspace-1' },
        }),
      },
      financeAiProviderConfig: {
        findMany: jest.fn().mockResolvedValue([
          {
            botIntegrationId: 'bot-1',
            apiKeyEncrypted: 'encrypted-key',
            apiKeyIv: 'iv',
            apiKeyAuthTag: 'tag',
          },
        ]),
      },
    };
    const encryption = { decrypt: jest.fn().mockReturnValue('openai-key') };
    const botApi = {
      getFile: jest.fn().mockResolvedValue({
        file_id: 'voice-file',
        file_path: 'voices/voice.ogg',
        file_size: options?.fileSize ?? 1024,
      }),
      downloadFile: jest.fn().mockResolvedValue({
        bytes: Buffer.from('voice-bytes'),
        contentType: 'audio/ogg',
      }),
    };
    const service = new FinanceAiProviderService(
      prisma as never,
      encryption as never,
      {} as never,
      botApi as never,
    );
    return { service, botApi, encryption };
  }

  it('downloads a bounded Telegram voice note and transcribes it through the configured provider', async () => {
    const { service, botApi, encryption } = createService();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ text: '  250 грн Bolt с mono  ' }),
    }) as never;

    await expect(
      service.extractVoiceTranscription({
        profileId: 'profile-1',
        botIntegrationId: 'bot-1',
        telegramToken: 'telegram-token',
        fileId: 'voice-file',
        mime: 'audio/ogg',
      }),
    ).resolves.toBe('250 грн Bolt с mono');

    expect(botApi.getFile).toHaveBeenCalledWith('telegram-token', 'voice-file');
    expect(botApi.downloadFile).toHaveBeenCalledWith(
      'telegram-token',
      'voices/voice.ogg',
      8 * 1024 * 1024,
    );
    expect(encryption.decrypt).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/audio/transcriptions',
      expect.objectContaining({
        headers: { Authorization: 'Bearer openai-key' },
        method: 'POST',
      }),
    );
  });

  it('rejects an oversized voice before Telegram download', async () => {
    const { service, botApi } = createService();

    await expect(
      service.extractVoiceTranscription({
        profileId: 'profile-1',
        botIntegrationId: 'bot-1',
        telegramToken: 'telegram-token',
        fileId: 'voice-file',
        fileSize: 8 * 1024 * 1024 + 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(botApi.getFile).not.toHaveBeenCalled();
    expect(botApi.downloadFile).not.toHaveBeenCalled();
  });

  it('rejects an empty transcription without producing a text proposal', async () => {
    const { service } = createService();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ text: '   ' }),
    }) as never;

    await expect(
      service.extractVoiceTranscription({
        profileId: 'profile-1',
        botIntegrationId: 'bot-1',
        telegramToken: 'telegram-token',
        fileId: 'voice-file',
      }),
    ).rejects.toThrow('Finance AI returned an invalid transcription');
  });
});

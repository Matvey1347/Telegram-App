/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
import sharp from 'sharp';
import { TelegramAiPostingChatMediaService } from './telegram-ai-posting-chat-media.service';

function wav() {
  const rate = 16000,
    b = Buffer.alloc(44 + rate * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(b.length - 44, 40);
  return b;
}
describe('channel chat attachment processing', () => {
  const prisma = {
    telegramChannel: { findFirst: jest.fn() },
    telegramAiPostingSettings: { findFirst: jest.fn() },
    telegramAiPostingChatAttachment: {
      create: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const workspace = { resolveWorkspaceIdForUser: jest.fn() };
  const gateway = { execute: jest.fn() };
  const service = new TelegramAiPostingChatMediaService(
    prisma as never,
    workspace as never,
    gateway as never,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    workspace.resolveWorkspaceIdForUser.mockResolvedValue('workspace');
    prisma.telegramChannel.findFirst.mockResolvedValue({ id: 'channel' });
    prisma.telegramAiPostingSettings.findFirst.mockResolvedValue(null);
    gateway.execute.mockResolvedValue({
      operation: { status: 'SUCCEEDED' },
      result: { reply: 'Описание' },
    });
    prisma.telegramAiPostingChatAttachment.create.mockResolvedValue({
      id: 'attachment',
    });
    prisma.telegramAiPostingChatAttachment.findMany.mockResolvedValue([]);
    prisma.telegramAiPostingChatAttachment.deleteMany.mockResolvedValue({
      count: 0,
    });
  });
  it('analyzes and stores a real decoded image within the channel scope', async () => {
    const image = await sharp({
      create: { width: 8, height: 8, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    const result = await service.analyzeAttachment('user', 'channel', {
      mimetype: 'image/png',
      originalname: 'image.png',
      buffer: image,
    } as Express.Multer.File);
    expect(result).toMatchObject({
      kind: 'image',
      analysis: 'Описание',
      id: 'attachment',
    });
    expect(prisma.telegramChannel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'channel', workspaceId: 'workspace' },
      }),
    );
    expect(gateway.execute.mock.calls[0][0].image.mime).toBe('image/jpeg');
  });
  it('transcribes bounded PCM audio and rejects fake audio before provider', async () => {
    const result = await service.analyzeAttachment('user', 'channel', {
      mimetype: 'audio/wav',
      originalname: 'voice.wav',
      buffer: wav(),
    } as Express.Multer.File);
    expect(result).toMatchObject({
      kind: 'audio',
      transcript: 'Описание',
      durationSeconds: 1,
      id: 'attachment',
    });
    await expect(
      service.analyzeAttachment('user', 'channel', {
        mimetype: 'audio/wav',
        originalname: 'voice.wav',
        buffer: Buffer.from('not wave'),
      } as Express.Multer.File),
    ).rejects.toThrow('AI_POSTING_CHAT_AUDIO_INVALID');
    expect(gateway.execute).toHaveBeenCalledTimes(1);
  });
  it('cleans only a bounded page of expired attachments in the same scope', async () => {
    prisma.telegramAiPostingChatAttachment.findMany.mockResolvedValueOnce([
      { id: 'expired' },
    ]);
    await service.analyzeAttachment('user', 'channel', {
      mimetype: 'audio/wav',
      originalname: 'voice.wav',
      buffer: wav(),
    } as Express.Multer.File);
    expect(
      prisma.telegramAiPostingChatAttachment.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 100,
        where: expect.objectContaining({
          workspaceId: 'workspace',
          telegramChannelId: 'channel',
          actorUserId: 'user',
        }),
      }),
    );
    expect(
      prisma.telegramAiPostingChatAttachment.deleteMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'workspace',
          telegramChannelId: 'channel',
          actorUserId: 'user',
          id: { in: ['expired'] },
        }),
      }),
    );
    expect(prisma.telegramAiPostingChatAttachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'workspace',
          telegramChannelId: 'channel',
          actorUserId: 'user',
          kind: 'audio',
        }),
      }),
    );
  });
  it('does not save an attachment when the active workspace changes during processing', async () => {
    workspace.resolveWorkspaceIdForUser
      .mockResolvedValueOnce('workspace')
      .mockResolvedValueOnce('workspace')
      .mockResolvedValueOnce('other');
    await expect(
      service.analyzeAttachment('user', 'channel', {
        mimetype: 'audio/wav',
        originalname: 'v.wav',
        buffer: wav(),
      } as Express.Multer.File),
    ).rejects.toThrow('AI_POSTING_CHAT_WORKSPACE_CHANGED');
    expect(
      prisma.telegramAiPostingChatAttachment.create,
    ).not.toHaveBeenCalled();
  });
  it('rejects an unavailable channel and an unknown-cost provider result', async () => {
    prisma.telegramChannel.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.transcribeAudio('user', 'other', {
        mimetype: 'audio/wav',
        originalname: 'v.wav',
        buffer: wav(),
      } as Express.Multer.File),
    ).rejects.toThrow('Telegram channel not found');
    gateway.execute.mockResolvedValueOnce({
      operation: { status: 'UNKNOWN' },
      result: { reply: 'Unsettled' },
    });
    await expect(
      service.transcribeAudio('user', 'channel', {
        mimetype: 'audio/wav',
        originalname: 'v.wav',
        buffer: wav(),
      } as Express.Multer.File),
    ).rejects.toThrow('AI_POSTING_CHAT_AUDIO_TRANSCRIPTION_FAILED');
  });
});

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { creativeFileSizeLimit } from '@telegram-system/shared';
import { creativeAttachment } from './creative-attachment';
import {
  CreateCreativeCommentDto,
  CreateCreativeDto,
} from './workspace-creatives.dto';
import { WorkspaceCreativesService } from './workspace-creatives.service';

const workspaceId = 'learning-space';
const userId = 'workspace-user';
const dto = {
  section: 'attempt',
  target: 'channel',
  title: 'Launch ad',
  text: 'A weekly digest worth opening',
  mentorComment: 'Lead with the outcome.',
} as const;

function setup() {
  const prisma = {
    workspaceCreative: {
      create: jest.fn<Promise<unknown>, [Prisma.WorkspaceCreativeCreateArgs]>(),
      findMany: jest.fn<
        Promise<unknown>,
        [Prisma.WorkspaceCreativeFindManyArgs]
      >(),
      findUnique: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    workspaceCreativeAttachment: { findFirst: jest.fn() },
  };
  const workspace = {
    resolveWorkspaceIdForUser: jest.fn().mockResolvedValue(workspaceId),
  };
  return {
    prisma,
    service: new WorkspaceCreativesService(prisma as never, workspace as never),
  };
}

describe('Workspace creatives', () => {
  it('stores creative content and its first mentor comment atomically', async () => {
    const { prisma, service } = setup();
    const saved = {
      id: 'new',
      title: dto.title,
      comments: [{ id: 'first', text: dto.mentorComment }],
    };
    prisma.workspaceCreative.create.mockResolvedValue(saved);
    await expect(service.create(userId, workspaceId, dto)).resolves.toEqual(
      saved,
    );
    expect(prisma.workspaceCreative.create.mock.calls[0][0].data).toMatchObject(
      {
        workspaceId,
        comments: { create: { text: dto.mentorComment } },
      },
    );
  });

  it('stores standalone mentor advice without a promotion type and rejects blank advice', async () => {
    const { prisma, service } = setup();
    const advice = { section: 'mentor', title: 'Open with the result', text: 'Show the benefit in the first line.' } as const;
    prisma.workspaceCreative.create.mockResolvedValue({ id: 'advice', ...advice, target: null });
    await expect(service.create(userId, workspaceId, advice)).resolves.toMatchObject({ section: 'mentor', target: null });
    expect(prisma.workspaceCreative.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ workspaceId, target: null, text: advice.text }),
    }));
    await expect(service.create(userId, workspaceId, { ...advice, text: ' ' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.workspaceCreative.create).toHaveBeenCalledTimes(1);
  });

  it('preserves formatted posts and media-only creatives with their buttons', async () => {
    const { prisma, service } = setup();
    const post = {
      text: '',
      imageUrls: [],
      mediaItems: [
        { url: 'https://example.test/clip.mp4', kind: 'VIDEO' as const },
      ],
      buttonRows: [
        [
          {
            text: 'Open',
            url: 'https://example.test/',
            style: 'primary' as const,
          },
        ],
      ],
    };
    prisma.workspaceCreative.create.mockResolvedValue({
      id: 'rich',
      post,
      text: '',
    });
    await expect(
      service.create(userId, workspaceId, { ...dto, post }),
    ).resolves.toMatchObject({ post });
    expect(prisma.workspaceCreative.create.mock.calls[0][0].data).toMatchObject(
      { text: '', post },
    );
    await expect(
      service.create(userId, workspaceId, {
        ...dto,
        post: {
          ...post,
          mediaItems: [{ ...post.mediaItems[0], url: 'javascript:alert(1)' }],
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.workspaceCreative.create).toHaveBeenCalledTimes(1);
  });

  it('appends independent comments without replacing saved feedback', async () => {
    const { prisma, service } = setup();
    const comments = [{ id: 'first', text: 'Show the buyer outcome.' }];
    prisma.workspaceCreative.update.mockImplementation(
      ({
        data,
      }: {
        data: { comments: { create: { id: string; text: string } } };
      }) => {
        comments.push(data.comments.create);
        return Promise.resolve({ id: 'draft' });
      },
    );
    const feedback = ['Shorten the opening.', 'Keep the screenshot.'];
    const added = await Promise.all(
      feedback.map((text) =>
        service.addComment(userId, workspaceId, 'draft', text),
      ),
    );
    expect(comments.slice(1)).toEqual(added);
    expect(comments.map(({ text }) => text)).toEqual([
      'Show the buyer outcome.',
      ...feedback,
    ]);
    expect(new Set(comments.map(({ id }) => id)).size).toBe(3);
    expect(prisma.workspaceCreative.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId, id: 'draft' },
      }),
    );
  });

  it('rejects a mismatched workspace before reading records or attachments', async () => {
    const { prisma, service } = setup();
    await expect(
      service.list(userId, 'another-space', { section: 'bad' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.attachment(userId, 'another-space', 'draft'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.workspaceCreative.findMany).not.toHaveBeenCalled();
    expect(prisma.workspaceCreativeAttachment.findFirst).not.toHaveBeenCalled();
  });

  it('returns not found when a comment targets a deleted or out-of-scope entry', async () => {
    const { prisma, service } = setup();
    prisma.workspaceCreative.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('missing', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );
    await expect(
      service.addComment(userId, workspaceId, 'missing', 'Feedback'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('advances the cursor from the last visible entry and leaves file bytes out', async () => {
    const { prisma, service } = setup();
    const rows = Array.from({ length: 21 }, (_, index) => ({
      id: String(100 + index),
    })).reverse();
    prisma.workspaceCreative.findMany.mockResolvedValue(rows);
    await expect(
      service.list(userId, workspaceId, { section: 'good', cursor: '121' }),
    ).resolves.toEqual({
      items: rows.slice(0, 20),
      nextCursor: rows[19].id,
    });
    expect(prisma.workspaceCreative.findMany.mock.calls[0][0]).toMatchObject({
      where: { workspaceId, section: 'good', id: { lt: '121' } },
      select: { attachment: { select: { name: true, mimeType: true } } },
    });
  });

  it('rejects blank comments and non-HTTP links', async () => {
    const results = await Promise.all([
      validate(plainToInstance(CreateCreativeCommentDto, { text: '   ' })),
      validate(
        plainToInstance(CreateCreativeDto, {
          ...dto,
          sourceUrl: 'javascript:alert(1)',
        }),
      ),
    ]);
    expect(
      results.map((errors) => errors.map(({ property }) => property)),
    ).toEqual([['text'], ['sourceUrl']]);
  });

  it('accepts a file at the size limit and rejects oversized or disguised HTML', () => {
    const bytes = Buffer.alloc(creativeFileSizeLimit);
    Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes);
    const file = {
      buffer: bytes,
      originalname: 'creative.png',
    } as Express.Multer.File;
    expect(creativeAttachment(file)?.bytes.length).toBe(creativeFileSizeLimit);
    expect(() =>
      creativeAttachment({
        ...file,
        buffer: Buffer.concat([bytes, Buffer.alloc(1)]),
      }),
    ).toThrow();
    expect(() =>
      creativeAttachment({
        ...file,
        buffer: Buffer.from('<html>invalid</html>'),
      }),
    ).toThrow();
  });
});

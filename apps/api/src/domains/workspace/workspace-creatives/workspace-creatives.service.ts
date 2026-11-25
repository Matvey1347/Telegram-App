import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreativeComment,
  WorkspaceCreative,
  WorkspaceCreativePage,
  WorkspaceCreativePost,
} from '@telegram-system/shared';
import {
  normalizeTelegramPostMediaItems,
  telegramPostPhotoUrls,
} from '@telegram-system/shared';
import { normalizeTelegramPostButtonRows } from '@api/telegram/shared/markup/telegram-inline-keyboard';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { WorkspaceService } from '../../../common/workspace.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { creativeAttachment } from './creative-attachment';
import type {
  CreateCreativeDto,
  CreativeListDto,
} from './workspace-creatives.dto';

const pageSize = 20;
const commentSelect = { id: true, text: true } as const;
const creativeSelect = {
  id: true,
  section: true,
  target: true,
  title: true,
  text: true,
  post: true,
  sourceUrl: true,
  attachment: { select: { name: true, mimeType: true } },
  comments: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: commentSelect,
  },
} satisfies Prisma.WorkspaceCreativeSelect;

function validPostUrl(value: string, allowTelegram = false) {
  if (value.length > 4000) return false;
  try {
    const url = new URL(value);
    return (
      Boolean(url.host) &&
      !url.username &&
      !url.password &&
      (['http:', 'https:'].includes(url.protocol) ||
        (allowTelegram && url.protocol === 'tg:'))
    );
  } catch {
    return false;
  }
}

function readPost(value: unknown): WorkspaceCreativePost | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const raw = value as Record<string, unknown>;
  const text = raw.text;
  const plainText = raw.plainText;
  const mediaItems = normalizeTelegramPostMediaItems(
    raw.mediaItems,
    raw.imageUrls,
  );
  const buttonRows = normalizeTelegramPostButtonRows(raw.buttonRows);
  const buttons = buttonRows.flat();
  const boundedText = (item: unknown, max: number) =>
    item === undefined || (typeof item === 'string' && item.length <= max);
  if (
    typeof text !== 'string' ||
    !boundedText(text, 32000) ||
    !boundedText(plainText, 32000) ||
    mediaItems.length > 10 ||
    mediaItems.some(({ url }) => !validPostUrl(url)) ||
    buttons.length > 100 ||
    buttons.some(
      ({ text, url }) => text.length > 256 || !validPostUrl(url, true),
    )
  ) {
    throw new BadRequestException('Invalid Telegram creative post');
  }
  return {
    text,
    ...(typeof plainText === 'string' ? { plainText } : {}),
    imageUrls: telegramPostPhotoUrls(mediaItems),
    mediaItems,
    buttonRows,
  };
}

function creativeView({
  post,
  ...entry
}: Prisma.WorkspaceCreativeGetPayload<{
  select: typeof creativeSelect;
}>): WorkspaceCreative {
  return { ...entry, ...(post ? { post: readPost(post) } : {}) };
}

@Injectable()
export class WorkspaceCreativesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
  ) {}

  async list(
    userId: string,
    workspaceId: string,
    query: CreativeListDto,
  ): Promise<WorkspaceCreativePage> {
    await this.assertWorkspace(userId, workspaceId);
    const results = await this.prisma.workspaceCreative.findMany({
      where: {
        workspaceId,
        section: query.section,
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: pageSize + 1,
      select: creativeSelect,
    });
    const items = results.slice(0, pageSize);
    return {
      items: items.map(creativeView),
      nextCursor: results.length > pageSize ? items[pageSize - 1].id : null,
    };
  }

  async get(
    userId: string,
    workspaceId: string,
    id: string,
  ): Promise<WorkspaceCreative> {
    await this.assertWorkspace(userId, workspaceId);
    const creative = await this.prisma.workspaceCreative.findUnique({
      where: { id, workspaceId },
      select: creativeSelect,
    });
    if (!creative) throw new NotFoundException('Creative not found');
    return creativeView(creative);
  }

  async create(
    userId: string,
    workspaceId: string,
    dto: CreateCreativeDto,
    file?: Express.Multer.File,
  ): Promise<WorkspaceCreative> {
    await this.assertWorkspace(userId, workspaceId);
    const advice = dto.section === 'mentor';
    if (advice && (!dto.text?.trim() || dto.post || file || dto.target || dto.mentorComment))
      throw new BadRequestException('A standalone mentor tip requires advice text');
    if (!advice && !dto.target)
      throw new BadRequestException('A creative promotion type is required');
    const attachment = creativeAttachment(file);
    const post = readPost(dto.post);
    const text = post?.text ?? dto.text ?? '';
    if (
      !text.trim() &&
      !post?.mediaItems?.length &&
      !dto.sourceUrl &&
      !attachment
    ) {
      throw new BadRequestException(
        'Creative text, a source link or an attachment is required',
      );
    }
    const created = await this.prisma.workspaceCreative.create({
      data: {
        workspaceId,
        section: dto.section,
        target: dto.target ?? null,
        title: dto.title,
        text: post?.plainText ?? text,
        post,
        sourceUrl: dto.sourceUrl ?? null,
        attachment: attachment ? { create: attachment } : undefined,
        comments: dto.mentorComment
          ? { create: { text: dto.mentorComment } }
          : undefined,
      },
      select: creativeSelect,
    });
    return creativeView(created);
  }

  async addComment(
    userId: string,
    workspaceId: string,
    id: string,
    text: string,
  ): Promise<CreativeComment> {
    await this.assertWorkspace(userId, workspaceId);
    const comment = { id: randomUUID(), text };
    try {
      await this.prisma.workspaceCreative.update({
        where: { id, workspaceId },
        data: { comments: { create: comment } },
        select: { id: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Creative not found');
      }
      throw error;
    }
    return comment;
  }

  async attachment(userId: string, workspaceId: string, id: string) {
    await this.assertWorkspace(userId, workspaceId);
    const attachment = await this.prisma.workspaceCreativeAttachment.findFirst({
      where: { creativeId: id, creative: { workspaceId } },
      select: { bytes: true, mimeType: true },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    return attachment;
  }

  async remove(userId: string, workspaceId: string, id: string) {
    await this.assertWorkspace(userId, workspaceId);
    const { count } = await this.prisma.workspaceCreative.deleteMany({
      where: { id, workspaceId },
    });
    if (!count) throw new NotFoundException('Creative not found');
  }

  private async assertWorkspace(userId: string, workspaceId: string) {
    if (
      (await this.workspace.resolveWorkspaceIdForUser(userId)) !== workspaceId
    ) {
      throw new ForbiddenException('Access denied for this workspace');
    }
  }
}

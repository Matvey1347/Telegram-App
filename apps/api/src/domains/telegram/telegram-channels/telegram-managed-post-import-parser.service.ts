import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ImportTelegramManagedPostRowDto } from './dto';
import { NormalizedManagedPostImportRow } from './telegram-channels.internal';

@Injectable()
export class TelegramManagedPostImportParserService {
  constructor(private readonly prisma: PrismaService) {}

  public stringFromImportCell(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
  }

  public cleanRepeatedMarkdownLinks(value: string) {
    let next = value;
    for (let pass = 0; pass < 3; pass += 1) {
      const cleaned = next.replace(
        /\[\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)\]\((https?:\/\/[^)\s]+)\)/g,
        '[$1]($2)',
      );
      if (cleaned === next) break;
      next = cleaned;
    }
    return next;
  }

  public cleanImportImageUrl(value: string) {
    const urls = [...value.matchAll(/https?:\/\/[^\s\])"']+/g)].map((match) =>
      match[0].replace(/[.,;:]+$/g, ''),
    );
    return urls.at(-1) ?? value.trim();
  }

  public imageUrlsFromImportRow(row: ImportTelegramManagedPostRowDto) {
    const values: unknown[] = [];
    const rawImages = row.urls ?? row.imageUrls ?? row.images;
    if (Array.isArray(rawImages)) {
      values.push(...rawImages);
    } else if (rawImages !== undefined && rawImages !== null) {
      values.push(rawImages);
    }
    const urls: string[] = [];
    for (const value of values) {
      if (typeof value !== 'string') {
        return { error: 'Image URLs must be strings' };
      }
      const parts = value
        .split(/\r?\n|,\s*(?=https?:\/\/)/i)
        .map((part) => part.trim())
        .filter(Boolean);
      urls.push(...parts.map((part) => this.cleanImportImageUrl(part)));
    }
    return { imageUrls: urls };
  }

  public normalizeManagedPostImportRow(row: ImportTelegramManagedPostRowDto): {
    value?: NormalizedManagedPostImportRow;
    error?: string;
  } {
    const title = this.stringFromImportCell(row.title);
    if (!title) return { error: 'Title is required' };
    const text =
      this.cleanRepeatedMarkdownLinks(this.stringFromImportCell(row.text)) ||
      null;
    const images = this.imageUrlsFromImportRow(row);
    if (images.error) return { error: images.error };
    const icon =
      this.stringFromImportCell(row.icon) ||
      this.stringFromImportCell(row.emoji) ||
      this.stringFromImportCell(row.iconText) ||
      null;
    const rawScheduledAt = row.scheduledAt;
    let scheduledAt: Date | null = null;
    if (
      rawScheduledAt !== undefined &&
      rawScheduledAt !== null &&
      rawScheduledAt !== ''
    ) {
      if (typeof rawScheduledAt !== 'string')
        return { error: 'scheduledAt must be an ISO timestamp or null' };
      scheduledAt = new Date(rawScheduledAt);
      if (Number.isNaN(scheduledAt.getTime()))
        return { error: 'scheduledAt must be a valid ISO timestamp' };
      if (scheduledAt.getTime() <= Date.now())
        return { error: 'scheduledAt must be in the future' };
    }
    const rawGroupId = row.groupId;
    if (
      rawGroupId !== undefined &&
      rawGroupId !== null &&
      typeof rawGroupId !== 'string'
    ) {
      return { error: 'groupId must be a string or null' };
    }
    return {
      value: {
        title,
        text,
        imageUrls: images.imageUrls ?? [],
        icon,
        groupId:
          rawGroupId === undefined ? undefined : rawGroupId?.trim() || null,
        scheduledAt,
      },
    };
  }

  public async resolveManagedPostImportIconId(
    workspaceId: string,
    userId: string,
    rawIcon: string | null,
    title: string,
  ) {
    const icon = rawIcon?.trim();
    if (!icon) return null;

    const existingById = await this.prisma.icon.findFirst({
      where: { id: icon, workspaceId },
      select: { id: true },
    });
    if (existingById) return existingById.id;

    const existingByEmoji = await this.prisma.icon.findFirst({
      where: { workspaceId, type: 'emoji', emoji: icon },
      select: { id: true },
    });
    if (existingByEmoji) {
      return (
        await this.prisma.icon.update({
          where: { id: existingByEmoji.id },
          data: { name: title, createdByUserId: userId },
          select: { id: true },
        })
      ).id;
    }

    return (
      await this.prisma.icon.upsert({
        where: {
          workspaceId_type_name: {
            workspaceId,
            type: 'emoji',
            name: title,
          },
        },
        update: {
          emoji: icon,
          createdByUserId: userId,
        },
        create: {
          workspaceId,
          type: 'emoji',
          name: title,
          emoji: icon,
          createdByUserId: userId,
        },
        select: { id: true },
      })
    ).id;
  }
}

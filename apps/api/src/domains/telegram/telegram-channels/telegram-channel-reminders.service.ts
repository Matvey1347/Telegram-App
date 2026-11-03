import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { WorkspaceService } from '../../../common/workspace.service';
import { notifyScheduledTaskDueWorkChanged } from '../../../common/scheduled-task-wake-notifier';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceAuthorizationService } from '../../workspace/workspace-authorization/workspace-authorization.service';
import {
  ChannelReminderAssignmentsDto,
  ChannelReminderTemplateDto,
} from './telegram-channel-reminders.dto';

export const CHANNEL_REMINDERS_TASK_KEY = 'telegram.channel_reminders.due';
const templateSelect = {
  id: true,
  name: true,
  iconId: true,
  icon: true,
  daysBefore: true,
  notifyEmpty: true,
} as const;

@Injectable()
export class TelegramChannelRemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspace: WorkspaceService,
    private readonly authorization: WorkspaceAuthorizationService,
  ) {}
  private async editor(userId: string) {
    await this.authorization.require(userId, 'channels.view');
    return (
      await this.workspace.requireWorkspaceRole(userId, [
        WorkspaceRole.owner,
        WorkspaceRole.admin,
      ])
    ).workspaceId;
  }
  private data(dto: ChannelReminderTemplateDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Name is required');
    if (!dto.notifyEmpty && !dto.daysBefore.length)
      throw new BadRequestException('Select at least one reminder');
    return {
      name,
      ...(dto.iconId !== undefined ? { iconId: dto.iconId } : {}),
      daysBefore: [...dto.daysBefore].sort((a, b) => a - b),
      notifyEmpty: dto.notifyEmpty,
    };
  }
  private async validateIcon(workspaceId: string, iconId?: string | null) {
    if (iconId && !(await this.prisma.icon.findFirst({ where: { id: iconId, OR: [{ workspaceId }, { workspaceId: null }] }, select: { id: true } })))
      throw new BadRequestException('Icon is unavailable in this workspace');
  }
  private mapTemplate<T extends { icon: Parameters<typeof iconToResolvedEmoji>[0] }>(template: T) {
    const { icon, ...rest } = template;
    return { ...rest, iconPresentation: iconToResolvedEmoji(icon) };
  }
  async list(userId: string) {
    const { workspaceId } = await this.authorization.require(userId, 'channels.view');
    const [templates, channels] = await Promise.all([
      this.prisma.telegramChannelReminderTemplate.findMany({
        where: { workspaceId },
        select: templateSelect,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.telegramChannel.findMany({
        where: { workspaceId, archivedAt: null },
        select: {
          id: true,
          assignedMemberId: true,
          reminderAssignment: { select: { templateId: true } },
        },
      }),
    ]);
    return {
      templates: templates.map((template) => this.mapTemplate(template)),
      assignments: channels.map((channel) => ({
        channelId: channel.id,
        templateId: channel.reminderAssignment?.templateId ?? null,
        memberId: channel.assignedMemberId,
      })),
    };
  }
  async create(userId: string, dto: ChannelReminderTemplateDto) {
    const workspaceId = await this.editor(userId);
    await this.validateIcon(workspaceId, dto.iconId);
    const template = await this.prisma.telegramChannelReminderTemplate.create({
      data: { workspaceId, ...this.data(dto) },
      select: templateSelect,
    });
    return this.mapTemplate(template);
  }
  async update(userId: string, id: string, dto: ChannelReminderTemplateDto) {
    const workspaceId = await this.editor(userId);
    await this.validateIcon(workspaceId, dto.iconId);
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.telegramChannelReminderTemplate.findFirst({
        where: { id, workspaceId },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Reminder template not found');
      const template = await tx.telegramChannelReminderTemplate.update({
        where: { id },
        data: this.data(dto),
        select: templateSelect,
      });
      await tx.telegramChannelReminderAssignment.updateMany({
        where: { workspaceId, templateId: id },
        data: { nextDueAt: new Date() },
      });
      return template;
    });
    notifyScheduledTaskDueWorkChanged(CHANNEL_REMINDERS_TASK_KEY);
    return this.mapTemplate(result);
  }
  async remove(userId: string, id: string) {
    const workspaceId = await this.editor(userId);
    const result = await this.prisma.telegramChannelReminderTemplate.deleteMany(
      { where: { id, workspaceId } },
    );
    if (!result.count)
      throw new NotFoundException('Reminder template not found');
    notifyScheduledTaskDueWorkChanged(CHANNEL_REMINDERS_TASK_KEY);
    return { deleted: true };
  }
  async assign(userId: string, dto: ChannelReminderAssignmentsDto) {
    const workspaceId = await this.editor(userId);
    const items = dto.items ?? dto.channelIds?.map((channelId) => ({
      channelId,
      templateId: dto.templateId,
      ...(dto.memberId !== undefined ? { memberId: dto.memberId } : {}),
    })) ?? [];
    if (!items.length)
      throw new BadRequestException('Select channels');
    if (new Set(items.map((item) => item.channelId)).size !== items.length)
      throw new BadRequestException('Channels must be unique');
    if (items.some((item) => item.templateId === undefined))
      throw new BadRequestException('Template selection is required');
    const now = new Date();
    let scheduleChanged = false;
    await this.prisma.$transaction(async (tx) => {
      const channels = await tx.telegramChannel.count({
        where: { workspaceId, id: { in: items.map((item) => item.channelId) }, archivedAt: null },
      });
      if (channels !== items.length)
        throw new NotFoundException('One or more channels not found');
      const templateIds = [...new Set(items.flatMap((item) => item.templateId ? [item.templateId] : []))];
      const memberIds = [...new Set(items.flatMap((item) => item.memberId ? [item.memberId] : []))];
      const validTemplates = await tx.telegramChannelReminderTemplate.count({ where: { workspaceId, id: { in: templateIds } } });
      if (validTemplates !== templateIds.length)
        throw new NotFoundException('Reminder template not found');
      const validMembers = await tx.workspaceMember.count({ where: { workspaceId, id: { in: memberIds } } });
      if (validMembers !== memberIds.length)
        throw new NotFoundException('Workspace member not found');
      const existingChannels = await tx.telegramChannel.findMany({ where: { workspaceId, id: { in: items.map((item) => item.channelId) } }, select: { id: true, assignedMemberId: true } });
      const currentAssignments = await tx.telegramChannelReminderAssignment.findMany({ where: { workspaceId, channelId: { in: items.map((item) => item.channelId) } }, select: { channelId: true, templateId: true } });
      const owners = new Map(existingChannels.map((channel) => [channel.id, channel.assignedMemberId]));
      const templates = new Map(currentAssignments.map((assignment) => [assignment.channelId, assignment.templateId]));
      const ownerGroups = new Map<string | null, string[]>();
      const templateGroups = new Map<string | null, string[]>();
      const changedChannelIds: string[] = [];
      for (const item of items) {
        if (item.memberId !== undefined && owners.get(item.channelId) !== item.memberId) {
          const ids = ownerGroups.get(item.memberId) ?? [];
          ids.push(item.channelId);
          ownerGroups.set(item.memberId, ids);
        }
        if (templates.get(item.channelId) !== item.templateId) {
          const ids = templateGroups.get(item.templateId ?? null) ?? [];
          ids.push(item.channelId);
          templateGroups.set(item.templateId ?? null, ids);
          changedChannelIds.push(item.channelId);
        }
      }
      for (const [memberId, ids] of ownerGroups)
        await tx.telegramChannel.updateMany({ where: { workspaceId, id: { in: ids } }, data: { assignedMemberId: memberId } });
      for (const [templateId, ids] of templateGroups) {
        if (templateId) {
          await tx.telegramChannelReminderAssignment.createMany({ data: ids.map((channelId) => ({ workspaceId, channelId, templateId, nextDueAt: now })), skipDuplicates: true });
          await tx.telegramChannelReminderAssignment.updateMany({ where: { workspaceId, channelId: { in: ids } }, data: { templateId, nextDueAt: now } });
        } else await tx.telegramChannelReminderAssignment.deleteMany({ where: { workspaceId, channelId: { in: ids } } });
      }
      scheduleChanged = changedChannelIds.length > 0;
    });
    if (scheduleChanged) notifyScheduledTaskDueWorkChanged(CHANNEL_REMINDERS_TASK_KEY);
    return this.list(userId);
  }
}

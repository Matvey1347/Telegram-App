import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  WorkspaceRole,
  WorkspaceRoleMode,
  WorkspaceRolePermissionEffect,
} from '@prisma/client';
import {
  WORKSPACE_FEATURE_REGISTRY,
  WORKSPACE_PERMISSION_REGISTRY,
  accessibleWorkspaceFeatureIds,
  effectiveWorkspacePermissionKeys,
  summarizeWorkspaceRole,
  validateWorkspacePermissionKeys,
  type WorkspaceRoleContract,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import type { CreateWorkspaceRoleDto, UpdateWorkspaceRoleDto } from './dto';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';

type RoleRow = Prisma.WorkspaceRoleDefinitionGetPayload<{
  include: {
    permissions: true;
    icon: true;
    _count: { select: { members: true } };
  };
}>;

@Injectable()
export class WorkspaceRolesService {
  private readonly roleInclude = {
    permissions: { orderBy: { permissionKey: 'asc' as const } },
    icon: true,
    _count: { select: { members: true } },
  } satisfies Prisma.WorkspaceRoleDefinitionInclude;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  private normalizeName(name: string) {
    const normalized = name.trim();
    if (!normalized) throw new ConflictException('Role name cannot be empty');
    return normalized;
  }

  private validatePermissions(permissionKeys: readonly string[]) {
    const invalid = validateWorkspacePermissionKeys(permissionKeys);
    if (invalid.length) {
      throw new ConflictException(
        `Unknown workspace permissions: ${invalid.join(', ')}`,
      );
    }
  }

  private permissionWrites(
    mode: WorkspaceRoleMode,
    permissionKeys: readonly string[],
  ) {
    const effect =
      mode === WorkspaceRoleMode.ALLOWLIST
        ? WorkspaceRolePermissionEffect.ALLOW
        : WorkspaceRolePermissionEffect.DENY;
    return [...new Set(permissionKeys)].map((permissionKey) => ({
      permissionKey,
      effect,
    }));
  }

  private toContract(row: RoleRow): WorkspaceRoleContract {
    const expectedEffect =
      row.mode === WorkspaceRoleMode.ALLOWLIST
        ? WorkspaceRolePermissionEffect.ALLOW
        : WorkspaceRolePermissionEffect.DENY;
    const permissionKeys = row.permissions
      .filter((permission) => permission.effect === expectedEffect)
      .map((permission) => permission.permissionKey);
    const isOwner = row.systemKey === 'OWNER';
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      name: row.name,
      description: row.description,
      emoji: row.emoji,
      iconId: row.iconId,
      iconPresentation: iconToResolvedEmoji(row.icon),
      mode: row.mode,
      permissionKeys,
      version: row.version,
      systemKey: isOwner ? 'OWNER' : null,
      membersCount: row._count.members,
      summaries: summarizeWorkspaceRole(
        { mode: row.mode, permissionKeys },
        isOwner,
      ),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async membership(userId: string) {
    return this.workspaceService.resolveWorkspaceMembershipForUser(userId);
  }

  private async requireOwner(userId: string) {
    return this.workspaceService.requireWorkspaceRole(userId, [
      WorkspaceRole.owner,
    ]);
  }

  private async roleInWorkspace(workspaceId: string, roleId: string) {
    const role = await this.prisma.workspaceRoleDefinition.findFirst({
      where: { id: roleId, workspaceId },
      include: this.roleInclude,
    });
    if (!role) throw new NotFoundException('Workspace role not found');
    return role;
  }

  private async validateIcon(workspaceId: string, iconId?: string | null) {
    if (!iconId) return;
    const icon = await this.prisma.icon.findFirst({
      where: { id: iconId, workspaceId },
      select: { id: true },
    });
    if (!icon) throw new NotFoundException('Workspace icon not found');
  }

  async registry(userId: string) {
    const membership = await this.membership(userId);
    const permissionKeys = effectiveWorkspacePermissionKeys(
      membership.roleDefinition
        ? {
            mode: membership.roleDefinition.mode,
            permissionKeys: membership.roleDefinition.permissions.map(
              ({ permissionKey }) => permissionKey,
            ),
          }
        : { mode: 'ALLOWLIST', permissionKeys: [] },
      membership.role === WorkspaceRole.owner,
    );
    const access = {
      roleId: membership.roleDefinition?.id ?? null,
      roleVersion: membership.roleDefinition?.version ?? 0,
      isOwner: membership.role === WorkspaceRole.owner,
      permissionKeys,
      featureIds: [] as string[],
    };
    access.featureIds = accessibleWorkspaceFeatureIds(access);
    return {
      version: 1,
      features: WORKSPACE_FEATURE_REGISTRY,
      permissions: WORKSPACE_PERMISSION_REGISTRY,
      access,
    };
  }

  async list(userId: string) {
    const membership = await this.membership(userId);
    const roles = await this.prisma.workspaceRoleDefinition.findMany({
      where: { workspaceId: membership.workspaceId },
      include: this.roleInclude,
      orderBy: [{ systemKey: 'desc' }, { name: 'asc' }],
    });
    return roles.map((role) => this.toContract(role));
  }

  async detail(userId: string, roleId: string) {
    const membership = await this.membership(userId);
    return this.toContract(
      await this.roleInWorkspace(membership.workspaceId, roleId),
    );
  }

  async create(userId: string, dto: CreateWorkspaceRoleDto) {
    const membership = await this.requireOwner(userId);
    this.validatePermissions(dto.permissionKeys);
    await this.validateIcon(membership.workspaceId, dto.iconId);
    try {
      const role = await this.prisma.workspaceRoleDefinition.create({
        data: {
          workspaceId: membership.workspaceId,
          name: this.normalizeName(dto.name),
          description: dto.description?.trim() ?? '',
          emoji: dto.emoji?.trim() || null,
          iconId: dto.iconId || null,
          mode: dto.mode,
          permissions: {
            create: this.permissionWrites(dto.mode, dto.permissionKeys),
          },
        },
        include: this.roleInclude,
      });
      return this.toContract(role);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A role with this name already exists');
      }
      throw error;
    }
  }

  async update(userId: string, roleId: string, dto: UpdateWorkspaceRoleDto) {
    const membership = await this.requireOwner(userId);
    const current = await this.roleInWorkspace(membership.workspaceId, roleId);
    if (current.systemKey === 'OWNER') {
      throw new ForbiddenException('The Owner role cannot be changed');
    }
    const mode = dto.mode ?? current.mode;
    const permissionKeys =
      dto.permissionKeys ??
      current.permissions.map((item) => item.permissionKey);
    this.validatePermissions(permissionKeys);
    if (dto.iconId !== undefined)
      await this.validateIcon(membership.workspaceId, dto.iconId);
    try {
      const role = await this.prisma.$transaction(async (tx) => {
        const result = await tx.workspaceRoleDefinition.updateMany({
          where: {
            id: roleId,
            workspaceId: membership.workspaceId,
            version: dto.version,
            systemKey: null,
          },
          data: {
            name:
              dto.name === undefined ? undefined : this.normalizeName(dto.name),
            description: dto.description?.trim(),
            emoji:
              dto.emoji === undefined ? undefined : dto.emoji?.trim() || null,
            iconId: dto.iconId === undefined ? undefined : dto.iconId || null,
            mode,
            version: { increment: 1 },
          },
        });
        if (result.count !== 1)
          throw new ConflictException('Role was changed by another request');
        if (dto.permissionKeys !== undefined || dto.mode !== undefined) {
          await tx.workspaceRolePermission.deleteMany({ where: { roleId } });
          const writes = this.permissionWrites(mode, permissionKeys);
          if (writes.length)
            await tx.workspaceRolePermission.createMany({
              data: writes.map((item) => ({ ...item, roleId })),
            });
        }
        return tx.workspaceRoleDefinition.findUniqueOrThrow({
          where: { id: roleId },
          include: this.roleInclude,
        });
      });
      return this.toContract(role);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('A role with this name already exists');
      }
      throw error;
    }
  }

  async copy(userId: string, roleId: string, dto: { name?: string }) {
    const membership = await this.requireOwner(userId);
    const source = await this.roleInWorkspace(membership.workspaceId, roleId);
    const permissionKeys = source.permissions.map((item) => item.permissionKey);
    return this.create(userId, {
      name: dto.name ?? `${source.name} copy`,
      description: source.description,
      emoji: source.emoji,
      iconId: source.iconId,
      mode: source.mode,
      permissionKeys,
    });
  }

  async assignMembers(userId: string, roleId: string, memberIds: string[]) {
    const membership = await this.requireOwner(userId);
    const role = await this.roleInWorkspace(membership.workspaceId, roleId);
    const members = await this.prisma.workspaceMember.findMany({
      where: { id: { in: memberIds }, workspaceId: membership.workspaceId },
      select: { id: true, role: true },
    });
    if (members.length !== memberIds.length)
      throw new NotFoundException(
        'One or more workspace members were not found',
      );
    const includesOwner = members.some(
      (member) => member.role === WorkspaceRole.owner,
    );
    if (includesOwner && role.systemKey !== 'OWNER') {
      throw new ForbiddenException('Workspace owners must keep the Owner role');
    }
    if (
      role.systemKey === 'OWNER' &&
      members.some((member) => member.role !== WorkspaceRole.owner)
    ) {
      throw new ForbiddenException(
        'Ownership cannot be granted through role assignment',
      );
    }
    await this.prisma.workspaceMember.updateMany({
      where: { id: { in: memberIds }, workspaceId: membership.workspaceId },
      data: {
        roleDefinitionId: role.id,
        role:
          role.systemKey === 'OWNER'
            ? WorkspaceRole.owner
            : WorkspaceRole.member,
      },
    });
    return { roleId: role.id, assignedMemberIds: memberIds };
  }

  async remove(userId: string, roleId: string) {
    const membership = await this.requireOwner(userId);
    const role = await this.roleInWorkspace(membership.workspaceId, roleId);
    if (role.systemKey === 'OWNER')
      throw new ForbiddenException('The Owner role cannot be deleted');
    if (role._count.members > 0)
      throw new ConflictException(
        'Reassign role members before deleting this role',
      );
    try {
      await this.prisma.workspaceRoleDefinition.delete({
        where: { id: role.id },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Reassign role members before deleting this role',
        );
      }
      throw error;
    }
    return { success: true };
  }
}

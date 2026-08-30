import { ForbiddenException, Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { WorkspaceRole } from '@prisma/client';
import type { Request } from 'express';
import {
  accessibleWorkspaceFeatureIds,
  effectiveWorkspacePermissionKeys,
  hasWorkspacePermission,
  type EffectiveWorkspaceAccess,
} from '@telegram-system/shared';
import { PrismaService } from '../../../prisma/prisma.service';
import { RequestContextService } from '../../../common/request-context/request-context.service';

export type WorkspaceAuthorizationContext = EffectiveWorkspaceAccess & {
  userId: string;
  workspaceId: string;
  memberId: string;
};

export type WorkspaceOwnershipScope =
  | { assignedMemberId: string }
  | Record<string, never>;

/**
 * Request-scoped authorization facade. The membership and role graph is loaded
 * at most once per user in a request, including concurrent callers.
 */
@Injectable({ scope: Scope.REQUEST })
export class WorkspaceAuthorizationService {
  private readonly contexts = new Map<
    string,
    Promise<WorkspaceAuthorizationContext>
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    @Inject(REQUEST) private readonly request: Request,
  ) {}

  context(userId: string): Promise<WorkspaceAuthorizationContext> {
    const cached = this.contexts.get(userId);
    if (cached) return cached;
    const pending = this.loadContext(userId);
    this.contexts.set(userId, pending);
    return pending;
  }

  async can(userId: string, permissionKey: string) {
    return hasWorkspacePermission(await this.context(userId), permissionKey);
  }

  async require(userId: string, permissionKey: string) {
    const context = await this.context(userId);
    if (!hasWorkspacePermission(context, permissionKey)) {
      throw new ForbiddenException(
        `Missing workspace permission: ${permissionKey}`,
      );
    }
    return context;
  }

  async requireOwnOrAny(
    userId: string,
    ownership: { assignedMemberId: string | null },
    ownPermissionKey: string,
    anyPermissionKey: string,
  ) {
    const context = await this.context(userId);
    if (hasWorkspacePermission(context, anyPermissionKey)) return context;
    if (
      ownership.assignedMemberId === context.memberId &&
      hasWorkspacePermission(context, ownPermissionKey)
    ) {
      return context;
    }
    throw new ForbiddenException('Insufficient workspace ownership permission');
  }

  async scope(
    userId: string,
    ownPermissionKey: string,
    anyPermissionKey: string,
  ): Promise<WorkspaceOwnershipScope> {
    const context = await this.context(userId);
    if (hasWorkspacePermission(context, anyPermissionKey)) return {};
    if (hasWorkspacePermission(context, ownPermissionKey)) {
      return { assignedMemberId: context.memberId };
    }
    throw new ForbiddenException('Insufficient workspace permission');
  }

  private async loadContext(
    userId: string,
  ): Promise<WorkspaceAuthorizationContext> {
    const rawWorkspaceId = this.request.headers['x-workspace-id'];
    const selectedWorkspaceId = Array.isArray(rawWorkspaceId)
      ? rawWorkspaceId[0]
      : rawWorkspaceId;
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId, workspaceId: selectedWorkspaceId || undefined },
      orderBy: selectedWorkspaceId ? undefined : { createdAt: 'asc' },
      select: {
        id: true,
        workspaceId: true,
        role: true,
        roleDefinition: {
          select: {
            id: true,
            version: true,
            mode: true,
            permissions: { select: { permissionKey: true } },
          },
        },
      },
    });
    if (!membership)
      throw new ForbiddenException('Access denied for this workspace');
    this.requestContext.set({ userId, workspaceId: membership.workspaceId });

    const isOwner = membership.role === WorkspaceRole.owner;
    // A missing role definition is invalid state and must never grant access.
    const permissionKeys = membership.roleDefinition
      ? effectiveWorkspacePermissionKeys(
          {
            mode: membership.roleDefinition.mode,
            permissionKeys: membership.roleDefinition.permissions.map(
              (permission) => permission.permissionKey,
            ),
          },
          isOwner,
        )
      : effectiveWorkspacePermissionKeys(
          { mode: 'ALLOWLIST', permissionKeys: [] },
          isOwner,
        );
    const access: WorkspaceAuthorizationContext = {
      userId,
      workspaceId: membership.workspaceId,
      memberId: membership.id,
      roleId: membership.roleDefinition?.id ?? null,
      roleVersion: membership.roleDefinition?.version ?? 0,
      isOwner,
      permissionKeys,
      featureIds: [],
    };
    access.featureIds = accessibleWorkspaceFeatureIds(access);
    return access;
  }
}

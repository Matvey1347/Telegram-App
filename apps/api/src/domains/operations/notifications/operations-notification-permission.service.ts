import { Injectable } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import {
  effectiveWorkspacePermissionKeys,
  hasWorkspacePermission,
} from '@telegram-system/shared';
import type { Prisma } from '@prisma/client';

export const operationsNotificationMemberSelect = {
  id: true,
  workspaceId: true,
  userId: true,
  role: true,
  createdAt: true,
  roleDefinition: {
    select: {
      mode: true,
      permissions: { select: { permissionKey: true } },
    },
  },
} satisfies Prisma.WorkspaceMemberSelect;

export type OperationsNotificationMember = Prisma.WorkspaceMemberGetPayload<{
  select: typeof operationsNotificationMemberSelect;
}>;

export type OperationsNotificationVisibilityScope = {
  requiredPermissionKey: string | null;
  ownPermissionKey: string | null;
  anyPermissionKey: string | null;
  visibilityMemberId: string | null;
};

@Injectable()
export class OperationsNotificationPermissionService {
  has(member: OperationsNotificationMember, permissionKey: string) {
    const isOwner = member.role === WorkspaceRole.owner;
    const permissionKeys = this.keys(member);
    return hasWorkspacePermission(
      {
        isOwner,
        permissionKeys,
      },
      permissionKey,
    );
  }

  keys(member: OperationsNotificationMember) {
    return effectiveWorkspacePermissionKeys(
      member.roleDefinition
        ? {
            mode: member.roleDefinition.mode,
            permissionKeys: member.roleDefinition.permissions.map(
              (permission) => permission.permissionKey,
            ),
          }
        : { mode: 'ALLOWLIST', permissionKeys: [] },
      member.role === WorkspaceRole.owner,
    );
  }

  canReceive(member: OperationsNotificationMember) {
    return this.has(member, 'operations.notifications');
  }

  canAccess(
    member: OperationsNotificationMember,
    scope: OperationsNotificationVisibilityScope,
  ) {
    return (
      this.canReceive(member) &&
      this.sourceVisible(this.keys(member), member.id, scope)
    );
  }

  sourceVisible(
    permissionKeys: Iterable<string>,
    memberId: string,
    scope: OperationsNotificationVisibilityScope,
  ) {
    const allowed = new Set(permissionKeys);
    if (
      scope.requiredPermissionKey &&
      !allowed.has(scope.requiredPermissionKey)
    ) {
      return false;
    }
    if (!scope.ownPermissionKey && !scope.anyPermissionKey) return true;
    if (scope.anyPermissionKey && allowed.has(scope.anyPermissionKey)) {
      return true;
    }
    return Boolean(
      scope.ownPermissionKey &&
      allowed.has(scope.ownPermissionKey) &&
      scope.visibilityMemberId === memberId,
    );
  }

  visibilityWhere(
    permissionKeys: Iterable<string>,
    memberId: string,
  ): Prisma.OperationsNotificationWhereInput {
    const allowed = [...permissionKeys];
    return {
      AND: [
        {
          OR: [
            { requiredPermissionKey: null },
            { requiredPermissionKey: { in: allowed } },
          ],
        },
        {
          OR: [
            { ownPermissionKey: null, anyPermissionKey: null },
            { anyPermissionKey: { in: allowed } },
            {
              ownPermissionKey: { in: allowed },
              visibilityMemberId: memberId,
            },
          ],
        },
      ],
    };
  }
}

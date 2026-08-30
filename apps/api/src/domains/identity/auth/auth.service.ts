import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkspaceService } from '../../../common/workspace.service';
import { iconToResolvedEmoji } from '../../../common/icons/resolved-emoji';
import { LoginDto, RegisterDto } from './dto';
import {
  accessibleWorkspaceFeatureIds,
  effectiveWorkspacePermissionKeys,
  type EditorShortcutPreferences,
} from '@telegram-system/shared';
import { WorkspaceRole } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly workspaceService: WorkspaceService,
  ) {}

  private async authResponse(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        editorShortcuts: true,
        authVersion: true,
      },
    });

    const membership =
      await this.workspaceService.resolveWorkspaceMembershipForUser(userId);
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      ver: user.authVersion,
    });
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
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        editorShortcuts:
          (user.editorShortcuts as EditorShortcutPreferences | null) ?? {},
      },
      workspace: {
        id: membership.workspace.id,
        name: membership.workspace.name,
        timezone: membership.workspace.timezone,
        role: membership.role,
        avatarIcon: membership.workspace.avatarIcon ?? null,
        avatarPresentation: iconToResolvedEmoji(
          membership.workspace.avatarIcon,
        ),
        access,
      },
    };
  }

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
    const name = dto.name.trim();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already exists');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { email, name, passwordHash },
      });
      const workspaceName = dto.workspaceName?.trim() || `${name}'s Workspace`;
      const workspaceId = randomUUID();
      await tx.$executeRaw(
        Prisma.sql`
          INSERT INTO "Workspace" (
            "id",
            "name",
            "timezone",
            "primaryCurrency",
            "secondaryCurrency",
            "createdAt",
            "updatedAt"
          )
          VALUES (${workspaceId}, ${workspaceName}, 'Europe/Warsaw', 'USD', 'UAH', NOW(), NOW())
        `,
      );
      await tx.workspaceMember.create({
        data: {
          userId: createdUser.id,
          workspaceId,
          role: 'owner',
        },
      });
      return createdUser;
    });

    return this.authResponse(user.id);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValid) throw new UnauthorizedException('Invalid credentials');

    return this.authResponse(user.id);
  }

  async me(userId: string) {
    try {
      const auth = await this.authResponse(userId);
      return { user: auth.user, workspace: auth.workspace };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new UnauthorizedException(
          'Session is invalid. Please sign in again.',
        );
      }
      throw error;
    }
  }
}

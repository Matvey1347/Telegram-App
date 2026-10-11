import type { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export async function provisionWorkspaceMemberAccount({
  prisma,
  email,
  name,
  password,
}: {
  prisma: PrismaService;
  email: string;
  name?: string;
  password?: string;
}): Promise<{
  user: User;
  temporaryPassword?: string;
  passwordHashToSet?: string;
}> {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (!existingUser) {
    const temporaryPassword = password || randomBytes(12).toString('base64url');
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);
    const user = await prisma.user.create({
      data: {
        email,
        name: name?.trim() || email.split('@')[0],
        passwordHash,
      },
    });
    return { user, temporaryPassword };
  }

  const membershipsCount = await prisma.workspaceMember.count({
    where: { userId: existingUser.id },
  });
  if (membershipsCount > 0) {
    if (password) {
      throw new BadRequestException(
        'This user already has an account. Their password cannot be changed while adding them to a workspace.',
      );
    }
    return { user: existingUser };
  }

  const temporaryPassword = password || randomBytes(12).toString('base64url');
  return {
    user: existingUser,
    temporaryPassword,
    passwordHashToSet: await bcrypt.hash(temporaryPassword, 10),
  };
}

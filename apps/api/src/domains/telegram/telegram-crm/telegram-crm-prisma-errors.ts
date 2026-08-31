import { Prisma } from '@prisma/client';

export const isPrismaUniqueConflict = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

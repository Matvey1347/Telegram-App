import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { FinanceSavingsGoalInputDto } from './finance-savings.dto';
import { FinanceSavingsReadService } from './finance-savings-read.service';

@Injectable()
export class FinanceSavingsGoalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reads: FinanceSavingsReadService,
  ) {}

  async create(profileId: string, input: FinanceSavingsGoalInputDto) {
    const row = await this.prisma.financeSavingsGoal.create({
      data: {
        profileId,
        name: input.name.trim(),
        targetAmount: this.positive(input.targetAmount),
        currency: input.currency.toUpperCase(),
        targetDate: input.targetDate ? new Date(input.targetDate) : null,
        note: input.note?.trim() || null,
      },
      select: { id: true },
    });
    return this.reads.goal(profileId, row.id);
  }

  async update(
    profileId: string,
    id: string,
    input: FinanceSavingsGoalInputDto,
  ) {
    const existing = await this.prisma.financeSavingsGoal.findFirst({
      where: { id, profileId },
      select: {
        currency: true,
        currentAllocated: true,
        status: true,
        version: true,
      },
    });
    if (!existing) throw new NotFoundException('Savings goal not found');
    if (existing.status === 'ARCHIVED')
      throw new ConflictException('Archived savings goal cannot be changed');
    const currency = input.currency.toUpperCase();
    if (currency !== existing.currency && !existing.currentAllocated.isZero())
      throw new ConflictException(
        'Savings goal currency cannot change after funds are allocated',
      );
    const changed = await this.prisma.financeSavingsGoal.updateMany({
      where: { id, profileId, version: existing.version },
      data: {
        name: input.name.trim(),
        targetAmount: this.positive(input.targetAmount),
        currency,
        targetDate: input.targetDate ? new Date(input.targetDate) : null,
        note: input.note?.trim() || null,
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1)
      throw new ConflictException('Savings goal changed concurrently');
    return this.reads.goal(profileId, id);
  }

  complete(profileId: string, id: string) {
    return this.transition(profileId, id, 'COMPLETED');
  }

  async archive(profileId: string, id: string) {
    const goal = await this.prisma.financeSavingsGoal.findFirst({
      where: { id, profileId },
      select: { linkedAllocated: true, status: true, version: true },
    });
    if (!goal) throw new NotFoundException('Savings goal not found');
    if (goal.status === 'ARCHIVED') return this.reads.goal(profileId, id);
    if (!goal.linkedAllocated.isZero())
      throw new ConflictException('Release allocated funds before archiving');
    const changed = await this.prisma.financeSavingsGoal.updateMany({
      where: {
        id,
        profileId,
        status: goal.status,
        version: goal.version,
        linkedAllocated: 0,
      },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1)
      throw new ConflictException('Savings goal changed concurrently');
    return this.reads.goal(profileId, id);
  }

  private async transition(profileId: string, id: string, status: 'COMPLETED') {
    const goal = await this.prisma.financeSavingsGoal.findFirst({
      where: { id, profileId },
      select: { status: true, version: true },
    });
    if (!goal) throw new NotFoundException('Savings goal not found');
    if (goal.status === status) return this.reads.goal(profileId, id);
    if (goal.status === 'ARCHIVED')
      throw new ConflictException('Archived savings goal cannot be changed');
    const changed = await this.prisma.financeSavingsGoal.updateMany({
      where: {
        id,
        profileId,
        status: goal.status,
        version: goal.version,
      },
      data: {
        status,
        completedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1)
      throw new ConflictException('Savings goal changed concurrently');
    return this.reads.goal(profileId, id);
  }

  private positive(value: string) {
    const amount = new Prisma.Decimal(value);
    if (!amount.isFinite() || !amount.isPositive())
      throw new BadRequestException('Target amount must be positive');
    return amount;
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class TransactionCategoryMemberPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(input: {
    workspaceId: string;
    type: 'income' | 'expense';
    categoryId: string;
    memberId?: string;
  }) {
    const category = await this.prisma.transactionCategory.findFirst({
      where: { id: input.categoryId, workspaceId: input.workspaceId },
    });
    if (!category) throw new NotFoundException('Category not found');
    if (category.type !== input.type) {
      throw new BadRequestException(
        `Category type mismatch. Expected ${input.type} category.`,
      );
    }

    const requiresMember =
      (input.type === 'income' && category.key === 'investment') ||
      (input.type === 'expense' && category.key === 'salary');
    if (requiresMember && !input.memberId) {
      throw new BadRequestException(
        category.key === 'salary'
          ? 'memberId is required for Salary expense category'
          : 'memberId is required for Investment income category',
      );
    }
    if (input.memberId) {
      const member = await this.prisma.workspaceMember.findFirst({
        where: { id: input.memberId, workspaceId: input.workspaceId },
      });
      if (!member) throw new NotFoundException('Member not found');
    }
    return category;
  }
}

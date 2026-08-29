import { Prisma } from '@prisma/client';
import { AdHypothesisQueryDto } from './dto/ad-hypothesis-query.dto';

export function buildAdHypothesisListWhere(
  workspaceId: string,
  query: AdHypothesisQueryDto,
): Prisma.AdHypothesisWhereInput {
  const search = query.search?.trim();
  return {
    workspaceId,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { status: { contains: search, mode: 'insensitive' } },
            { conclusion: { contains: search, mode: 'insensitive' } },
            {
              telegramChannel: {
                workspaceId,
                OR: [
                  { title: { contains: search, mode: 'insensitive' } },
                  { username: { contains: search, mode: 'insensitive' } },
                ],
              },
            },
            {
              campaigns: {
                some: {
                  workspaceId,
                  adCampaign: {
                    workspaceId,
                    OR: [
                      {
                        decisionText: {
                          contains: search,
                          mode: 'insensitive',
                        },
                      },
                      {
                        overallStatus: {
                          contains: search,
                          mode: 'insensitive',
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        }
      : {}),
  };
}

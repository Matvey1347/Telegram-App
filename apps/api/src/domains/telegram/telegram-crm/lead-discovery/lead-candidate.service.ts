import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  LeadContact,
  LeadCandidateReviewInput,
} from '@telegram-system/shared';
import { ResponseCacheService } from '../../../../common/response-cache.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { acquirePostgresTransactionLock } from '../../../../prisma/postgres-advisory-lock';
import { TelegramLeadCrmLinker } from './lead-crm-linker.service';
import { TelegramLeadPolicy } from './lead-policy.service';
import { TelegramLeadReadService } from './lead-read.service';
import { normalizeLeadContact, strongLeadIdentity } from './lead-normalization';
@Injectable()
export class TelegramLeadCandidateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: TelegramLeadPolicy,
    private readonly read: TelegramLeadReadService,
    private readonly linker: TelegramLeadCrmLinker,
    @Optional() private readonly responseCache?: ResponseCacheService,
  ) {}
  async fromMaterial(
    userId: string,
    observationId: string,
    input: { title: string; contacts: LeadContact[] },
  ) {
    const { workspaceId } = await this.policy.access(userId, 'review');
    await this.materialCandidate(workspaceId, userId, observationId, input);
    const observation =
      await this.prisma.telegramLeadObservation.findFirstOrThrow({
        where: { id: observationId, workspaceId },
        select: { candidateId: true },
      });
    return this.read.candidate(userId, observation.candidateId!);
  }
  async materialCandidate(
    workspaceId: string,
    userId: string,
    observationId: string,
    input: { title: string; contacts: LeadContact[] },
    expectedHash?: string,
    mode: 'ingest' | 'ai' = 'ingest',
  ) {
    if (
      !input.title?.trim() ||
      input.title.length > 300 ||
      !Array.isArray(input.contacts) ||
      input.contacts.length > 12
    )
      throw new BadRequestException('LEAD_CANDIDATE_INVALID');
    return this.prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(tx, `lead-discovery:${workspaceId}`);
      const observation = await tx.telegramLeadObservation.findFirst({
        where: { id: observationId, workspaceId },
        include: { source: true },
      });
      if (
        !observation ||
        observation.expiresAt <= new Date() ||
        observation.reviewStatus === 'REJECTED' ||
        observation.originalStatus !== 'OBSERVED' ||
        (expectedHash && observation.contentHash !== expectedHash)
      )
        throw new ConflictException('LEAD_MATERIAL_NOT_ELIGIBLE');
      this.policy.assertProcessing(observation.source, mode, false);
      if (observation.candidateId) return observation.candidateId;
      const contacts = input.contacts.map((contact) =>
        normalizeLeadContact(contact, observation.text),
      );
      const identityKey = strongLeadIdentity(contacts);
      let candidate = identityKey
        ? await tx.telegramLeadCandidate.findUnique({
            where: { workspaceId_identityKey: { workspaceId, identityKey } },
          })
        : null;
      for (
        let depth = 0;
        candidate?.reviewStatus === 'MERGED' && candidate.mergedIntoId;
        depth++
      ) {
        if (depth >= 10) throw new ConflictException('LEAD_ALIAS_CHAIN_LIMIT');
        candidate = await tx.telegramLeadCandidate.findFirst({
          where: { id: candidate.mergedIntoId, workspaceId },
        });
      }
      const classification = observation.classification as {
        niche?: unknown;
        offerType?: unknown;
        risks?: unknown[];
      } | null;
      if (!candidate)
        candidate = await tx.telegramLeadCandidate.create({
          data: {
            workspaceId,
            title: input.title.trim(),
            identityKey,
            sourceIds: [observation.sourceId],
            contacts: contacts,
            niche:
              typeof classification?.niche === 'string'
                ? classification.niche.slice(0, 300)
                : '',
            offerType:
              typeof classification?.offerType === 'string'
                ? classification.offerType.slice(0, 300)
                : '',
            risks: [
              'UNVERIFIED_BUSINESS_IDENTITY',
              ...(Array.isArray(classification?.risks)
                ? classification.risks
                    .filter(
                      (value): value is string => typeof value === 'string',
                    )
                    .slice(0, 9)
                : []),
            ],
            riskStatus: 'NEEDS_REVIEW',
            reviewStatus: 'PENDING',
            reviewHistory: [],
            expiresAt: new Date(Date.now() + 90 * 86400000),
          },
        });
      const sourceIds = Array.isArray(candidate.sourceIds)
        ? candidate.sourceIds.filter(
            (id): id is string => typeof id === 'string',
          )
        : [];
      const expiresAt = new Date(
        Math.max(
          candidate.expiresAt.getTime(),
          observation.expiresAt.getTime(),
        ),
      );
      if (
        !sourceIds.includes(observation.sourceId) ||
        expiresAt > candidate.expiresAt
      )
        await tx.telegramLeadCandidate.update({
          where: { id: candidate.id },
          data: {
            sourceIds: [...new Set([...sourceIds, observation.sourceId])].slice(
              0,
              1000,
            ),
            expiresAt,
          },
        });
      await tx.telegramLeadObservation.update({
        where: { id: observation.id },
        data: { candidateId: candidate.id },
      });
      return candidate.id;
    });
  }
  async reviewObservation(
    userId: string,
    id: string,
    status: 'APPROVED' | 'REJECTED',
  ) {
    const { workspaceId } = await this.policy.access(userId, 'review');
    if (!['APPROVED', 'REJECTED'].includes(status))
      throw new BadRequestException('LEAD_REVIEW_INVALID');
    const row = await this.prisma.telegramLeadObservation.findFirst({
      where: { id, workspaceId },
      select: { id: true, reviewStatus: true },
    });
    if (!row) throw new NotFoundException('LEAD_OBSERVATION_NOT_FOUND');
    if (row.reviewStatus !== status)
      await this.prisma.telegramLeadObservation.update({
        where: { id },
        data: { reviewStatus: status },
      });
    return this.read.observation(userId, id);
  }
  async review(userId: string, id: string, input: LeadCandidateReviewInput) {
    const access = await this.policy.access(userId, 'review');
    if (
      !Number.isInteger(input.revision) ||
      input.revision < 1 ||
      !['APPROVE', 'REJECT', 'LINK', 'CREATE_CLIENT', 'MERGE'].includes(
        input.action,
      )
    )
      throw new BadRequestException('LEAD_REVIEW_INVALID');
    await this.prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(
        tx,
        `lead-discovery:${access.workspaceId}`,
      );
      const row = await tx.telegramLeadCandidate.findFirst({
        where: { id, workspaceId: access.workspaceId },
      });
      if (!row) throw new NotFoundException('LEAD_CANDIDATE_NOT_FOUND');
      if (
        row.revision !== input.revision ||
        row.reviewStatus === 'MERGED' ||
        row.expiresAt <= new Date()
      )
        throw new ConflictException('LEAD_CANDIDATE_REVISION_CHANGED');
      const originalContacts = row.contacts as unknown as LeadContact[];
      const indexes = input.confirmedContactIndexes ?? [];
      if (
        indexes.some(
          (index) =>
            !Number.isInteger(index) ||
            index < 0 ||
            index >= originalContacts.length,
        ) ||
        new Set(indexes).size !== indexes.length
      )
        throw new BadRequestException('LEAD_CONFIRMED_CONTACT_INDEX_INVALID');
      const contacts = originalContacts.map((contact, index) => ({
        ...contact,
        confirmed: contact.confirmed === true || indexes.includes(index),
      }));
      const history = [
        ...(row.reviewHistory as unknown as Array<{
          at: string;
          action: string;
          actorUserId: string;
        }>),
        {
          at: new Date().toISOString(),
          action: input.action,
          actorUserId: userId,
        },
      ].slice(-10);
      const data: Prisma.TelegramLeadCandidateUpdateInput = {
        revision: { increment: 1 },
        reviewHistory: history,
        contacts: contacts,
        ...(input.riskStatus ? { riskStatus: input.riskStatus } : {}),
      };
      if (input.action === 'REJECT') {
        data.reviewStatus = 'REJECTED';
        data.riskStatus = 'REJECTED';
      }
      if (input.action === 'APPROVE') {
        if (
          (row.riskStatus === 'REJECTED' &&
            input.riskStatus !== 'ACCEPTABLE') ||
          input.riskStatus === 'REJECTED'
        )
          throw new ConflictException('LEAD_REJECTED_RISK_REQUIRES_REVIEW');
        data.reviewStatus = 'APPROVED';
      }
      if (input.action === 'MERGE') {
        if (!input.mergeIntoId || input.mergeIntoId === id)
          throw new BadRequestException('LEAD_MERGE_TARGET_INVALID');
        const target = await tx.telegramLeadCandidate.findFirst({
          where: {
            id: input.mergeIntoId,
            workspaceId: access.workspaceId,
            reviewStatus: { not: 'MERGED' },
          },
        });
        if (!target) throw new NotFoundException('LEAD_MERGE_TARGET_NOT_FOUND');
        const materialIds = await tx.telegramLeadObservation.findMany({
          where: { workspaceId: access.workspaceId, candidateId: id },
          select: { id: true },
          take: 5001,
        });
        if (materialIds.length > 5000)
          throw new ConflictException('LEAD_MERGE_TOO_LARGE');
        if (
          row.reviewStatus === 'REJECTED' ||
          row.riskStatus === 'REJECTED' ||
          target.reviewStatus === 'REJECTED' ||
          target.riskStatus === 'REJECTED'
        )
          throw new ConflictException('LEAD_REJECTED_MERGE_REQUIRES_REVIEW');
        const targetContacts = target.contacts as unknown as LeadContact[];
        if (
          row.contactId &&
          target.contactId &&
          row.contactId !== target.contactId
        )
          throw new ConflictException('LEAD_MERGE_CLIENT_CONFLICT');
        const sourceIds = [
          ...new Set(
            [
              ...(Array.isArray(row.sourceIds) ? row.sourceIds : []),
              ...(Array.isArray(target.sourceIds) ? target.sourceIds : []),
            ].filter((value): value is string => typeof value === 'string'),
          ),
        ].slice(0, 1000);
        const merged = [
          ...new Map(
            [...contacts, ...targetContacts]
              .sort(
                (a, b) =>
                  Number(a.confirmed === true) - Number(b.confirmed === true),
              )
              .map((contact) => [
                `${contact.type}:${contact.value.toLowerCase()}`,
                contact,
              ]),
          ).values(),
        ];
        if (merged.length > 12)
          throw new ConflictException('LEAD_MERGE_CONTACT_LIMIT');
        await tx.telegramLeadCandidate.update({
          where: { id: target.id },
          data: {
            contacts: merged,
            sourceIds,
            expiresAt: new Date(
              Math.max(target.expiresAt.getTime(), row.expiresAt.getTime()),
            ),
            revision: { increment: 1 },
            reviewHistory: [
              ...(target.reviewHistory as unknown as typeof history),
              ...history.slice(-1),
            ].slice(-10),
          },
        });
        await tx.telegramLeadObservation.updateMany({
          where: { workspaceId: access.workspaceId, candidateId: id },
          data: { candidateId: target.id },
        });
        data.reviewStatus = 'MERGED';
        data.mergedIntoId = target.id;
      }
      if (input.action === 'LINK' || input.action === 'CREATE_CLIENT')
        data.contact = {
          connect: {
            id_workspaceId: {
              id: await this.linker.link(
                tx,
                userId,
                access.workspaceId,
                row,
                contacts,
                input,
              ),
              workspaceId: access.workspaceId,
            },
          },
        };
      await tx.telegramLeadCandidate.update({ where: { id: row.id }, data });
    });
    if (input.action === 'CREATE_CLIENT')
      this.responseCache?.clearWorkspacePath(
        access.workspaceId,
        '/telegram-crm/contacts',
      );
    return this.read.candidate(userId, id);
  }
  async bulkReview(
    userId: string,
    ids: string[],
    action: 'APPROVE' | 'REJECT',
  ) {
    const { workspaceId } = await this.policy.access(userId, 'review');
    if (ids.length > 20 || new Set(ids).size !== ids.length)
      throw new BadRequestException('LEAD_BULK_REVIEW_LIMIT');
    if (!ids.length) return { items: [] };
    await this.prisma.$transaction(async (tx) => {
      await acquirePostgresTransactionLock(tx, `lead-discovery:${workspaceId}`);
      const rows = await tx.telegramLeadCandidate.findMany({
        where: { workspaceId, id: { in: ids } },
      });
      if (rows.length !== ids.length)
        throw new NotFoundException('LEAD_CANDIDATE_NOT_FOUND');
      if (
        rows.some(
          (row) =>
            row.reviewStatus === 'MERGED' ||
            row.expiresAt <= new Date() ||
            (action === 'APPROVE' && row.riskStatus === 'REJECTED'),
        )
      )
        throw new ConflictException('LEAD_BULK_REVIEW_NOT_ALLOWED');
      const status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      const changed = rows.filter(
        (row) =>
          row.reviewStatus !== status ||
          (action === 'REJECT' && row.riskStatus !== 'REJECTED'),
      );
      if (changed.length) {
        const now = new Date().toISOString();
        const values = changed.map(
          (row) =>
            Prisma.sql`(${row.id},${row.revision}::int,${status},${action === 'REJECT' ? 'REJECTED' : row.riskStatus},${JSON.stringify([...(row.reviewHistory as unknown as Array<{ at: string; action: string; actorUserId: string }>), { at: now, action, actorUserId: userId }].slice(-10))}::jsonb)`,
        );
        await tx.$executeRaw(
          Prisma.sql`UPDATE "TelegramLeadCandidate" c SET "reviewStatus"=v.status,"riskStatus"=v.risk,"reviewHistory"=v.history,revision=c.revision+1,"updatedAt"=(NOW() AT TIME ZONE 'UTC') FROM (VALUES ${Prisma.join(values)}) v(id,revision,status,risk,history) WHERE c.id=v.id AND c."workspaceId"=${workspaceId} AND c.revision=v.revision`,
        );
      }
    });
    return { items: await this.read.candidateSummaries(userId, ids) };
  }
}

import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { LeadContact } from '@telegram-system/shared';
import type { PrismaService } from '../../../../prisma/prisma.service';
import { acquirePostgresTransactionLock } from '../../../../prisma/postgres-advisory-lock';
import {
  lockLeadAnalysisClaim,
  type LeadAnalysisClaim,
} from './lead-analysis-claim';
import { leadIdentityUnverified } from './lead-source-reference';
import type { TelegramLeadPolicy } from './lead-policy.service';
import { extractLiteralSalesContacts } from './lead-text-contact-resolver';
import {
  leadHash,
  normalizeLeadContact,
  strongLeadIdentity,
} from './lead-normalization';
import {
  leadTransportMatches,
  type LeadTransportSnapshot,
} from './lead-transport-snapshot';

export async function createLeadMaterialCandidate(
  prisma: PrismaService,
  policy: TelegramLeadPolicy,
  workspaceId: string,
  userId: string,
  observationId: string,
  input: { title: string; contacts: LeadContact[] },
  expectedHash?: string,
  mode: 'ingest' | 'ai' = 'ingest',
  requireActive = false,
  expectedSource?: LeadTransportSnapshot,
  claim?: LeadAnalysisClaim,
  provisionalDestination?: string,
  publicProfile?: {
    channelId: string;
    username: string;
    about: string;
    pinned?: { id: number; text: string };
  },
  unresolvedProject = false,
) {
  if (
    !input.title?.trim() ||
    input.title.length > 300 ||
    !Array.isArray(input.contacts) ||
    input.contacts.length > 12
  )
    throw new BadRequestException('LEAD_CANDIDATE_INVALID');
  return prisma.$transaction(async (tx) => {
    await acquirePostgresTransactionLock(tx, `lead-discovery:${workspaceId}`);
    if (requireActive)
      await tx.$queryRaw(
        Prisma.sql`SELECT s.id FROM "TelegramLeadSource" s JOIN "TelegramLeadObservation" o ON o."sourceId"=s.id AND o."workspaceId"=s."workspaceId" WHERE o.id=${observationId} AND o."workspaceId"=${workspaceId} FOR UPDATE OF s`,
      );
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
    if (
      requireActive &&
      (!expectedSource ||
        !leadTransportMatches(observation.source, expectedSource))
    )
      throw new ConflictException('LEAD_SOURCE_CHANGED');
    policy.assertProcessing(observation.source, mode, requireActive);
    if (claim) await lockLeadAnalysisClaim(tx, claim);
    if (observation.candidateId) return observation.candidateId;
    const provisionalQueue =
      claim && provisionalDestination
        ? await tx.telegramLeadAnalysisQueue.findUnique({
            where: { id: claim.id },
            select: { prefilterTargets: true, prefilterDecision: true },
          })
        : null;
    const provisionalTargets = Array.isArray(provisionalQueue?.prefilterTargets)
      ? provisionalQueue.prefilterTargets
      : [];
    const telegramName = provisionalDestination?.startsWith('@')
      ? provisionalDestination.slice(1).toLowerCase()
      : null;
    const telegramTarget =
      telegramName && /^[a-z][a-z0-9_]{3,31}$/.test(telegramName)
        ? provisionalTargets.find(
            (item) =>
              item &&
              typeof item === 'object' &&
              !Array.isArray(item) &&
              item.kind === 'TELEGRAM_USERNAME' &&
              typeof item.value === 'string' &&
              item.value.toLowerCase() === telegramName &&
              typeof item.origin === 'string' &&
              ['TEXT', 'TEXT_URL', 'INLINE_BUTTON', 'ENTITY'].includes(
                item.origin,
              ),
          )
        : null;
    const contacts = input.contacts.map((contact) => ({
      ...(telegramTarget &&
      contact.type === 'TELEGRAM' &&
      contact.role === 'ADVERTISED_DESTINATION' &&
      contact.value.toLowerCase() === `@${telegramName}`
        ? {
            type: 'TELEGRAM' as const,
            role: 'ADVERTISED_DESTINATION' as const,
            value: `@${telegramName}`,
            evidence: `@${telegramName}`,
            confirmed: false,
            evidenceSource: (
              telegramTarget as {
                origin: 'TEXT' | 'TEXT_URL' | 'INLINE_BUTTON' | 'ENTITY';
              }
            ).origin,
          }
        : normalizeLeadContact(contact, observation.text)),
      ...(observation.messageUrl
        ? { evidenceUrl: observation.messageUrl }
        : {}),
    }));
    if (publicProfile) {
      if (
        !telegramTarget ||
        publicProfile.username.toLowerCase() !== telegramName ||
        !/^\d{1,20}$/.test(publicProfile.channelId) ||
        publicProfile.about.length > 4096
      )
        throw new BadRequestException('LEAD_CANDIDATE_INVALID');
      contacts.push(
        ...extractLiteralSalesContacts(publicProfile.about)
          .slice(0, Math.max(0, 12 - contacts.length))
          .map((contact) => ({
            ...normalizeLeadContact(contact, publicProfile.about),
            evidenceUrl: `https://t.me/${publicProfile.username}`,
            evidenceSource: 'PUBLIC_PROFILE' as const,
          })),
      );
      if (
        publicProfile.pinned &&
        Number.isSafeInteger(publicProfile.pinned.id) &&
        publicProfile.pinned.id > 0 &&
        publicProfile.pinned.text.length <= 4096
      ) {
        const pin = publicProfile.pinned;
        contacts.push(
          ...extractLiteralSalesContacts(pin.text)
            .slice(0, Math.max(0, 12 - contacts.length))
            .map((contact) => ({
              ...normalizeLeadContact(contact, pin.text),
              evidenceUrl: `https://t.me/${publicProfile.username}/${pin.id}`,
              evidenceSource: 'PUBLIC_PROFILE' as const,
            })),
        );
      }
    }
    // A name alone is not a reliable identity. Group contactless candidates
    // only when the entire creative is identical and its name is literal.
    if (
      !unresolvedProject &&
      !contacts.length &&
      !observation.text.includes(input.title.trim())
    )
      throw new BadRequestException('LEAD_PROJECT_NAME_NOT_LITERAL');
    if (unresolvedProject) {
      if (
        !claim ||
        provisionalDestination ||
        input.title !== 'Неустановленный проект'
      )
        throw new BadRequestException('LEAD_CANDIDATE_INVALID');
      const unresolvedQueue = await tx.telegramLeadAnalysisQueue.findUnique({
        where: { id: claim.id },
        select: { prefilterDecision: true },
      });
      if (unresolvedQueue?.prefilterDecision !== 'LIKELY_AD')
        throw new BadRequestException('LEAD_CANDIDATE_INVALID');
    }
    let channelIdentity: string | null = null;
    if (claim) {
      const queue = await tx.telegramLeadAnalysisQueue.findUnique({
        where: { id: claim.id },
        select: { prefilterTargets: true, prefilterDecision: true },
      });
      const targets = Array.isArray(queue?.prefilterTargets)
        ? (queue.prefilterTargets as unknown[])
        : [];
      const ids = [
        ...new Set(
          targets.flatMap((value) => {
            if (!value || typeof value !== 'object') return [];
            const target = value as {
              kind?: unknown;
              value?: unknown;
              confidence?: unknown;
            };
            return target.kind === 'TELEGRAM_CHANNEL_ID' &&
              target.confidence === 'CANONICAL' &&
              typeof target.value === 'string' &&
              /^\d{1,20}$/.test(target.value)
              ? [target.value]
              : [];
          }),
        ),
      ];
      if (
        ids.length === 1 &&
        ['LIKELY_AD', 'LIKELY_VP'].includes(queue?.prefilterDecision ?? '')
      ) {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "TelegramLeadSource" WHERE "workspaceId"=${workspaceId} AND "channelId"=${ids[0]} FOR SHARE`,
        );
        const target = await tx.telegramLeadSource.findFirst({
          where: {
            workspaceId,
            channelId: ids[0],
            accessType: 'SUBSCRIBED_CHANNEL',
            monitoringState: 'ACTIVE',
            monitoringActorUserId: userId,
          },
        });
        const noAmbiguousTargets = targets.every((value) => {
          if (!value || typeof value !== 'object') return false;
          const item = value as { kind?: unknown; value?: unknown };
          return (
            (item.kind === 'TELEGRAM_CHANNEL_ID' && item.value === ids[0]) ||
            (item.kind === 'TELEGRAM_USERNAME' &&
              typeof item.value === 'string' &&
              item.value === target?.username?.toLowerCase())
          );
        });
        if (
          target &&
          !leadIdentityUnverified(target) &&
          noAmbiguousTargets &&
          policy.granted(target, 'ingest')
        )
          channelIdentity = `telegram-channel:${ids[0]}`;
      }
    }
    if (
      provisionalDestination &&
      (!claim ||
        (!telegramTarget &&
          !observation.text.includes(provisionalDestination)) ||
        !contacts.some(
          (contact) =>
            contact.role === 'ADVERTISED_DESTINATION' &&
            contact.value.replace(/\/$/, '') ===
              provisionalDestination.replace(/\/$/, ''),
        ))
    )
      throw new BadRequestException('LEAD_CANDIDATE_INVALID');
    if (provisionalDestination) {
      const queue = await tx.telegramLeadAnalysisQueue.findUnique({
        where: { id: claim!.id },
        select: { prefilterDecision: true, prefilterTargets: true },
      });
      const targets = Array.isArray(queue?.prefilterTargets)
        ? queue.prefilterTargets
        : [];
      const publicTargets = targets.filter(
        (value) =>
          value &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          value.kind === 'PUBLIC_URL',
      );
      const uniqueTelegram = new Set(
        targets.flatMap((item) =>
          item &&
          typeof item === 'object' &&
          !Array.isArray(item) &&
          item.kind === 'TELEGRAM_USERNAME' &&
          typeof item.value === 'string' &&
          typeof item.origin === 'string' &&
          ['TEXT', 'TEXT_URL', 'INLINE_BUTTON', 'ENTITY'].includes(item.origin)
            ? [item.value.toLowerCase()]
            : [],
        ),
      );
      if (
        telegramName
          ? queue?.prefilterDecision !== 'LIKELY_AD' ||
            !telegramTarget ||
            uniqueTelegram.size !== 1 ||
            publicTargets.length > 0 ||
            targets.some(
              (item) =>
                item &&
                typeof item === 'object' &&
                !Array.isArray(item) &&
                item.kind === 'PRIVATE_INVITE',
            )
          : queue?.prefilterDecision !== 'LIKELY_AD' ||
            !publicTargets.some(
              (value) =>
                value &&
                typeof value === 'object' &&
                !Array.isArray(value) &&
                typeof value.value === 'string' &&
                value.value.replace(/\/$/, '') ===
                  provisionalDestination.replace(/\/$/, ''),
            ) ||
            new Set(
              publicTargets.map((value) =>
                value && typeof value === 'object' && !Array.isArray(value)
                  ? value.value
                  : null,
              ),
            ).size !== 1
      )
        throw new BadRequestException('LEAD_CANDIDATE_INVALID');
    }
    const identityKey =
      channelIdentity ||
      (provisionalDestination
        ? telegramName
          ? publicProfile
            ? `telegram-channel:${publicProfile.channelId}`
            : `unverified-telegram:${telegramName}`
          : `unverified-destination:${leadHash(new URL(provisionalDestination).toString().replace(/\/$/, ''))}`
        : unresolvedProject
          ? null
          : strongLeadIdentity(contacts)) ||
      (unresolvedProject
        ? `unresolved-observation:${observation.id}`
        : !contacts.length
          ? `creative:${leadHash(observation.text)}`
          : null);
    let candidate = identityKey
      ? await tx.telegramLeadCandidate.findUnique({
          where: { workspaceId_identityKey: { workspaceId, identityKey } },
        })
      : null;
    if (!candidate && telegramName && !publicProfile) {
      const sameUsername = await tx.telegramLeadCandidate.findMany({
        where: {
          workspaceId,
          identityKey: { startsWith: 'telegram-channel:' },
          reviewStatus: { not: 'MERGED' },
          contacts: {
            array_contains: [
              {
                type: 'TELEGRAM',
                role: 'ADVERTISED_DESTINATION',
                value: `@${telegramName}`,
              },
            ],
          },
        },
        take: 2,
      });
      if (sameUsername.length === 1) candidate = sameUsername[0];
    }
    if (!candidate && publicProfile && telegramName && identityKey) {
      const unresolved = await tx.telegramLeadCandidate.findUnique({
        where: {
          workspaceId_identityKey: {
            workspaceId,
            identityKey: `unverified-telegram:${telegramName}`,
          },
        },
      });
      if (unresolved && unresolved.reviewStatus !== 'MERGED')
        candidate = await tx.telegramLeadCandidate.update({
          where: { id: unresolved.id },
          data: { identityKey },
        });
    }
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
            ...(unresolvedProject ? ['UNRESOLVED_PROJECT'] : []),
            ...(provisionalDestination &&
            !contacts.some(
              (contact) =>
                contact.role === 'SALES_CONTACT' ||
                contact.role === 'ADVERTISER',
            )
              ? ['UNRESOLVED_BUSINESS_CONTACT']
              : []),
            ...(Array.isArray(classification?.risks)
              ? classification.risks
                  .filter((value): value is string => typeof value === 'string')
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
      ? candidate.sourceIds.filter((id): id is string => typeof id === 'string')
      : [];
    const expiresAt = new Date(
      Math.max(candidate.expiresAt.getTime(), observation.expiresAt.getTime()),
    );
    const existingContacts = Array.isArray(candidate.contacts)
      ? candidate.contacts
      : [];
    const contactKey = (value: unknown) => {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return '';
      const item = value as Record<string, unknown>;
      return JSON.stringify(
        [
          'type',
          'value',
          'role',
          'evidence',
          'evidenceUrl',
          'evidenceSource',
          'purpose',
          'confirmed',
        ].map((key) => item[key] ?? null),
      );
    };
    const knownContacts = new Set(existingContacts.map(contactKey));
    const addedContacts = provisionalDestination
      ? contacts.filter((contact) => !knownContacts.has(contactKey(contact)))
      : [];
    const mergedContacts = [...existingContacts, ...addedContacts].slice(0, 12);
    if (
      !sourceIds.includes(observation.sourceId) ||
      expiresAt > candidate.expiresAt ||
      (addedContacts.length > 0 && existingContacts.length < 12)
    )
      await tx.telegramLeadCandidate.update({
        where: { id: candidate.id },
        data: {
          sourceIds: [...new Set([...sourceIds, observation.sourceId])].slice(
            0,
            1000,
          ),
          expiresAt,
          ...(addedContacts.length > 0 && existingContacts.length < 12
            ? { contacts: mergedContacts }
            : {}),
        },
      });
    await tx.telegramLeadObservation.update({
      where: { id: observation.id },
      data: { candidateId: candidate.id },
    });
    return candidate.id;
  });
}

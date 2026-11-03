import { createHash } from 'node:crypto';
import type { LeadContact } from '@telegram-system/shared';
import { normalizeLeadContact } from './lead-normalization';

/** Local experiment only: no controller, timer, production provider or MTProto session. */
export const MEDIA_PILOT_MAX_POSTS = 30;
export const MEDIA_PILOT_MAX_BYTES = 5 * 1024 * 1024;

export type PilotPost = {
  workspaceId: string;
  sourceId: string;
  observationId: string;
  messageId: number;
  bindingRevision: number;
  contentHash: string;
  caption: string;
  entityEvidence?: unknown;
  publishedAt?: string;
  editedAt?: string | null;
  textEntitiesComplete: boolean;
};
export type PilotReading = {
  classification: 'ADVERTISEMENT' | 'ORGANIC' | 'UNCERTAIN';
  projectName: string;
  contacts: string[];
  evidence: string;
  confidence: number;
};
export type PilotResult = {
  decision: 'REVIEW_CANDIDATE' | 'NEEDS_MEDIA_REVIEW' | 'NEEDS_METADATA';
  vision: PilotReading | null;
  contacts: LeadContact[];
  reviewRequired: true;
};
export type PilotPorts = {
  /** Recheck actor, workspace, source binding and both ingest/AI grants. */
  authorize(post: PilotPost): Promise<void>;
  /** Existing live-account owner only; implementation must enforce maxBytes during download. */
  readMedia(
    post: PilotPost,
    maxBytes: number,
  ): Promise<{ data: Buffer; mime: string }>;
  /** Bounded vision/OCR provider. No implementation is configured in production. */
  analyze(input: {
    image: Buffer;
    mime: string;
    caption: string;
  }): Promise<PilotReading>;
  /** Atomic persistent batch-budget reservation across workers; uncertain operations stay blocked. */
  reserve(
    key: string,
    maximumMicros: number,
  ): Promise<
    | { state: 'NEW' }
    | { state: 'COMPLETE'; result: PilotResult }
    | { state: 'BLOCKED' }
  >;
  /** Persist outcome before candidate creation, so replay never repeats the provider call. */
  complete(key: string, result: PilotResult): Promise<void>;
  /** Never auto-retry an operation after the provider may have received it. */
  uncertain(key: string): Promise<void>;
  /** Release a reservation only if the provider was definitely not invoked. */
  cancelBeforeDispatch(key: string): Promise<void>;
  /** Idempotent, provisional only; implement with workspace/source/identity checks. */
  upsertReviewCandidate(
    key: string,
    post: PilotPost,
    result: PilotResult,
  ): Promise<void>;
};

function pilotKey(post: PilotPost) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        'lead-media-pilot-v1',
        post.workspaceId,
        post.sourceId,
        post.observationId,
        post.bindingRevision,
        post.contentHash,
      ]),
    )
    .digest('hex');
}

function supportedImage(data: Buffer, mime: string) {
  if (!data.length || data.length > MEDIA_PILOT_MAX_BYTES) return false;
  if (mime === 'image/jpeg')
    return (
      data.length >= 3 &&
      data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    );
  if (mime === 'image/png')
    return (
      data.length >= 8 &&
      data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    );
  if (mime === 'image/webp')
    return (
      data.length >= 12 &&
      data.toString('ascii', 0, 4) === 'RIFF' &&
      data.toString('ascii', 8, 12) === 'WEBP'
    );
  return false;
}

function literalCaptionContacts(caption: string): LeadContact[] {
  const found: LeadContact[] = [];
  const matches = caption.matchAll(
    /(?:пишіть|напишіть|пишите|контакт(?:и|ы)?|замовлення|заказ|sales contact|contact us|write to|message us)[^@\n]{0,60}(@[A-Za-z][A-Za-z0-9_]{3,31})/giu,
  );
  for (const match of matches) {
    try {
      const value = match[1];
      const contact = normalizeLeadContact(
        { type: 'TELEGRAM', role: 'SALES_CONTACT', value, evidence: value },
        caption,
      );
      if (!found.some((item) => item.value === contact.value))
        found.push(contact);
    } catch {
      // A candidate contact is useful only when the shared validator accepts it.
    }
    if (found.length === 12) break;
  }
  return found;
}

export function evaluatePilotReading(
  reading: PilotReading,
  caption: string,
): PilotResult {
  if (
    !reading ||
    !['ADVERTISEMENT', 'ORGANIC', 'UNCERTAIN'].includes(
      reading.classification,
    ) ||
    typeof reading.projectName !== 'string' ||
    reading.projectName.length > 300 ||
    typeof reading.evidence !== 'string' ||
    reading.evidence.length > 500 ||
    !Array.isArray(reading.contacts) ||
    reading.contacts.length > 12 ||
    reading.contacts.some((c) => typeof c !== 'string' || c.length > 300) ||
    typeof reading.confidence !== 'number' ||
    !Number.isFinite(reading.confidence) ||
    reading.confidence < 0 ||
    reading.confidence > 1
  )
    throw new Error('INVALID_MEDIA_READING');
  const eligible =
    reading.classification === 'ADVERTISEMENT' &&
    reading.confidence >= 0.8 &&
    reading.projectName.trim().length > 0 &&
    reading.evidence.trim().length > 0;
  return eligible
    ? {
        decision: 'REVIEW_CANDIDATE',
        vision: reading,
        contacts: literalCaptionContacts(caption),
        reviewRequired: true,
      }
    : {
        decision: 'NEEDS_MEDIA_REVIEW',
        vision: reading,
        contacts: [],
        reviewRequired: true,
      };
}

/** A manual invocation, one source and a hard cap; no media is saved by this function. */
export async function runMediaPilot(
  posts: PilotPost[],
  ports: PilotPorts,
  maxCostPerPostMicros: number,
): Promise<{ processed: number; blocked: number; results: PilotResult[] }> {
  if (
    !posts.length ||
    posts.length > MEDIA_PILOT_MAX_POSTS ||
    !Number.isSafeInteger(maxCostPerPostMicros) ||
    maxCostPerPostMicros <= 0 ||
    new Set(posts.map((p) => `${p.workspaceId}:${p.sourceId}`)).size !== 1 ||
    new Set(posts.map((p) => p.observationId)).size !== posts.length
  )
    throw new Error('INVALID_MEDIA_PILOT');
  const summary = { processed: 0, blocked: 0, results: [] as PilotResult[] };
  for (const post of posts) {
    if (!post.textEntitiesComplete) {
      summary.results.push({
        decision: 'NEEDS_METADATA',
        vision: null,
        contacts: [],
        reviewRequired: true,
      });
      continue;
    }
    await ports.authorize(post);
    const key = pilotKey(post);
    const reservation = await ports.reserve(key, maxCostPerPostMicros);
    if (reservation.state === 'BLOCKED') {
      summary.blocked++;
      continue;
    }
    let result: PilotResult;
    if (reservation.state === 'COMPLETE') {
      result = reservation.result;
    } else {
      let dispatched = false;
      let image: Buffer | undefined;
      try {
        const media = await ports.readMedia(post, MEDIA_PILOT_MAX_BYTES);
        image = media.data;
        if (!supportedImage(media.data, media.mime))
          throw new Error('UNSUPPORTED_MEDIA');
        await ports.authorize(post);
        dispatched = true;
        let reading: PilotReading;
        try {
          reading = await ports.analyze({
            image: media.data,
            mime: media.mime,
            caption: post.caption,
          });
        } finally {
          media.data.fill(0);
        }
        result = evaluatePilotReading(reading, post.caption);
        await ports.complete(key, result);
      } catch (error) {
        if (dispatched) await ports.uncertain(key);
        else await ports.cancelBeforeDispatch(key);
        throw error;
      } finally {
        image?.fill(0);
      }
    }
    if (result.decision === 'REVIEW_CANDIDATE') {
      await ports.authorize(post);
      await ports.upsertReviewCandidate(key, post, result);
    }
    summary.results.push(result);
    summary.processed++;
  }
  return summary;
}

import { extractLeadTargetEvidence, resolveLeadTargets } from './lead-advertised-targets';
import { prefilterLeadPost } from './lead-prefilter';
import { resolveTextContact } from './lead-text-contact-resolver';
import { leadHash } from './lead-normalization';
import type { TelegramLeadPost } from '../../../../telegram/shared/mtproto/telegram-lead-channel.types';

/** Rule findings are provisional and must never overwrite reviewed CRM decisions. */
export function classifySweepPost(
  post: TelegramLeadPost,
  source: { channelId: string; username: string | null },
) {
  const evidence = resolveLeadTargets(extractLeadTargetEvidence(post.text, post.metadata), source, []);
  const result = prefilterLeadPost({
    text: post.text,
    metadataComplete: post.metadata?.complete === true,
    textMetadataComplete: post.metadata?.textComplete ?? null,
    mediaPresent: post.metadata?.hasMedia ?? null,
    advertisedTargets: [],
    externalEvidence: evidence,
    sourceChannelId: source.channelId,
  });
  const candidate = result.decision === 'LIKELY_AD' ? resolveTextContact(post.text, evidence) : null;
  return {
    decision: result.decision,
    version: result.ruleVersion,
    signals: result.matchedSignals,
    candidate: candidate ? {
      identityKey: leadHash(candidate.title.toLocaleLowerCase()),
      title: candidate.title,
      contacts: candidate.contacts,
    } : null,
  };
}

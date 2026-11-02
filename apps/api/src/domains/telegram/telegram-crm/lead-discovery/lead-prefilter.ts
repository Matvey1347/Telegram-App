/** Versioned hints for review and AI admission; no claim of payment or identity. */
export const LEAD_PREFILTER_VERSION = 'lead-prefilter-v3';
export type LeadPrefilterDecision =
  | 'SAFE_SKIP'
  | 'LIKELY_AD'
  | 'LIKELY_VP'
  | 'NEEDS_AI'
  | 'NEEDS_MEDIA_ANALYSIS'
  | 'NEEDS_METADATA';
export type LeadPrefilterInput = {
  text: string;
  metadataComplete: boolean;
  textMetadataComplete?: boolean | null;
  mediaPresent?: boolean | null;
  /** Only canonical, verified identities; usernames alone are not identities. */
  advertisedTargets: string[];
  /** Literal destinations are evidence, never verified project identities. */
  externalEvidence?: Array<{ kind: string; origin: string; value: string }>;
  sourceChannelId?: string | null;
  contentHash?: string;
  verifiedDuplicate?: {
    contentHash: string;
    resultId: string;
    current: boolean;
    successful: boolean;
  } | null;
};
export type LeadPrefilterResult = {
  decision: LeadPrefilterDecision;
  ruleVersion: string;
  matchedSignals: string[];
  reason: string;
  advertisedTargets: string[];
  confidenceBand: 'HIGH' | 'MEDIUM' | 'LOW';
  reusedResultId?: string;
};

export function prefilterLeadPost(
  input: LeadPrefilterInput,
): LeadPrefilterResult {
  const targets = [...new Set(input.advertisedTargets)].filter(
    (id) => /^\d{1,20}$/.test(id) && id !== input.sourceChannelId,
  );
  const base = {
    ruleVersion: LEAD_PREFILTER_VERSION,
    advertisedTargets: targets,
  };
  const duplicate = input.verifiedDuplicate;
  const textComplete = input.textMetadataComplete ?? input.metadataComplete;
  const mediaUnknown =
    input.mediaPresent === true ||
    (input.mediaPresent == null && !input.metadataComplete);
  if (
    !mediaUnknown &&
    textComplete &&
    Boolean(
      input.sourceChannelId && /^\d{1,20}$/.test(input.sourceChannelId),
    ) &&
    input.contentHash &&
    duplicate?.current &&
    duplicate.successful &&
    duplicate.resultId &&
    duplicate.contentHash === input.contentHash
  )
    return {
      ...base,
      decision: 'SAFE_SKIP',
      matchedSignals: ['VERIFIED_DUPLICATE'],
      reason: 'Reuse the current verified result.',
      confidenceBand: 'HIGH',
      reusedResultId: duplicate.resultId,
    };

  const text = input.text.normalize('NFKC');
  const mutual =
    /(?:взаимопиар|взаємопіар|взаимный\s+пиар|взаємний\s+піар|mutual\s+promotion)/iu.test(
      text,
    );
  const callToAction =
    /(?:підписуй|подписывай|переходьте|переходите|замов(?:ити|ляй|лен)|заказывай|заказат|реєструйт|регистрируйт|subscribe|sign\s+up|order\s+now)/iu.test(
      text,
    );
  const commercial =
    /(?:реклам|спонсор|промокод|купити|купить|пропозиці|предложени|розпродаж|ціна|цена|оплата|доставка|advertis|sponsor|promo\s*code|discount)/iu.test(
      text,
    );
  const external = (input.externalEvidence ?? []).filter(
    (item) =>
      ['TELEGRAM_USERNAME', 'PUBLIC_URL', 'PRIVATE_INVITE'].includes(
        item.kind,
      ) &&
      item.origin !== 'FORWARD' &&
      item.value.length > 0,
  );
  const buttonBot = external.some(
    (item) =>
      item.kind === 'TELEGRAM_USERNAME' &&
      /_bot$/i.test(item.value) &&
      ['INLINE_BUTTON', 'TEXT_URL'].includes(item.origin),
  );
  const productBenefit =
    /завдяки\s+.{0,80}(?:систем|сервіс|сервис|платформ)/iu.test(text);
  const namedChannel = /(?:канал[а-яіїєґ]*|футбол[^\n]{0,50}telegram)/iu.test(
    text,
  );
  const signals = [
    mutual && 'MUTUAL_PROMOTION_LANGUAGE',
    callToAction && 'CALL_TO_ACTION',
    commercial && 'COMMERCIAL_LANGUAGE',
    targets.length > 0 && 'VERIFIED_THIRD_PARTY_TARGET',
    external.length > 0 && 'UNVERIFIED_EXTERNAL_DESTINATION',
    buttonBot && 'BOT_DESTINATION',
    productBenefit && 'SERVICE_BENEFIT',
  ].filter((signal): signal is string => Boolean(signal));
  const validSource = Boolean(
    input.sourceChannelId && /^\d{1,20}$/.test(input.sourceChannelId),
  );
  if (validSource && mutual && (targets.length || external.length))
    return {
      ...base,
      decision: 'LIKELY_VP',
      matchedSignals: signals,
      reason:
        'Mutual-promotion wording and an external destination require review; reciprocity is unconfirmed.',
      confidenceBand: 'MEDIUM',
    };
  if (
    validSource &&
    (targets.length || external.length) &&
    ((callToAction && (commercial || namedChannel)) ||
      (buttonBot && productBenefit))
  )
    return {
      ...base,
      decision: 'LIKELY_AD',
      matchedSignals: signals,
      reason:
        'Text and destination suggest promotion; identity and payment are unverified.',
      confidenceBand: 'MEDIUM',
    };
  if (
    !textComplete ||
    !input.sourceChannelId ||
    !/^\d{1,20}$/.test(input.sourceChannelId)
  )
    return {
      ...base,
      decision: 'NEEDS_METADATA',
      matchedSignals: signals,
      reason: 'Source or message metadata is incomplete.',
      confidenceBand: 'LOW',
    };
  if (mutual && targets.length)
    return {
      ...base,
      decision: 'LIKELY_VP',
      matchedSignals: signals,
      reason:
        'Mutual-promotion wording references another verified channel; reciprocity is not established.',
      confidenceBand: 'MEDIUM',
    };
  if (targets.length && callToAction && commercial)
    return {
      ...base,
      decision: 'LIKELY_AD',
      matchedSignals: signals,
      reason:
        'Commercial wording and a call to action reference another verified channel.',
      confidenceBand: 'MEDIUM',
    };
  if (mediaUnknown)
    return {
      ...base,
      decision: 'NEEDS_MEDIA_ANALYSIS',
      matchedSignals: signals,
      reason: 'The media content has not been analyzed.',
      confidenceBand: 'LOW',
    };
  return {
    ...base,
    decision: 'NEEDS_AI',
    matchedSignals: signals,
    reason: 'Evidence does not support a safe deterministic conclusion.',
    confidenceBand: 'LOW',
  };
}

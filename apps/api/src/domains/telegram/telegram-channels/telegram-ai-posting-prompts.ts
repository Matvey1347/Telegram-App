export type TelegramAiPostingRule = {
  id: string;
  text: string;
  source: 'feedback' | 'manual';
  active: boolean;
  createdAt: string;
  feedbackId?: string;
};

export function mandatoryChannelRules(configuration: Record<string, unknown>) {
  const rules = Array.isArray(configuration.rules)
    ? (configuration.rules as TelegramAiPostingRule[]).filter(
        (rule) =>
          rule &&
          rule.active === true &&
          typeof rule.text === 'string' &&
          rule.text.trim(),
      )
    : [];
  return rules.length
    ? `ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА КАНАЛА\n${rules.map((rule, index) => `${index + 1}. ${rule.text.trim()}`).join('\n')}`
    : 'ОБЯЗАТЕЛЬНЫЕ ПРАВИЛА КАНАЛА\nНет активных правил.';
}

export function editorialDescription(configuration: Record<string, unknown>) {
  const fields = [
    ['Описание канала', configuration.channelDescription],
    ['Тематика', configuration.topic],
    ['Аудитория', configuration.audience],
    ['Стиль', configuration.style],
    ['Инструкции владельца', configuration.instructions],
  ] as const;
  return fields
    .filter(([, value]) => typeof value === 'string' && value.trim())
    .map(([label, value]) => `${label}: ${String(value).trim()}`)
    .join('\n');
}

export function publicationEmojiInstruction(
  configuration: Record<string, unknown>,
) {
  if (configuration.emojiPolicy === 'start') {
    return 'Use exactly one relevant emoji at the very beginning of the post and no other emojis.';
  }
  return 'Use 2–3 relevant emojis in a normal-length post, distributed through its body and placed next to the ideas they illustrate; use 1–2 in a short post. Do not put them all at the beginning, repeat the same emoji, or add decorative or unrelated emojis.';
}

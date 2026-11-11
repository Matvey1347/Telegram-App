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

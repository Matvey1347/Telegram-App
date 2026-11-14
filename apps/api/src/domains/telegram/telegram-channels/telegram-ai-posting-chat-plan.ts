export type TelegramAiPostingChatPlan = {
  reply: string;
  setup: { query: string; rubric: string; description?: string; entityId?: string } | null;
  topic: string | null;
  revision: 'text' | 'image' | null;
};

/** The model output is untrusted; only a bounded, explicitly described action is accepted. */
export function parseTelegramAiPostingChatPlan(raw: string): TelegramAiPostingChatPlan | null {
  let value: unknown;
  try { value = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (typeof data.reply !== 'string' || !data.reply.trim() || data.reply.length > 8000) return null;
  let setup: TelegramAiPostingChatPlan['setup'] = null;
  if (data.setup !== null && data.setup !== undefined) {
    if (!data.setup || typeof data.setup !== 'object' || Array.isArray(data.setup)) return null;
    const action = data.setup as Record<string, unknown>;
    if (typeof action.query !== 'string' || !action.query.trim() || action.query.length > 160 || typeof action.rubric !== 'string' || !action.rubric.trim() || action.rubric.length > 120) return null;
    if (action.description != null && (typeof action.description !== 'string' || action.description.length > 500)) return null;
    if (action.entityId != null && (typeof action.entityId !== 'string' || !/^Q[1-9][0-9]{0,12}$/.test(action.entityId))) return null;
    setup = { query: action.query.trim(), rubric: action.rubric.trim(), ...(typeof action.description === 'string' && action.description.trim() ? { description: action.description.trim() } : {}), ...(typeof action.entityId === 'string' ? { entityId: action.entityId } : {}) };
  }
  const topic = typeof data.topic === 'string' && data.topic.trim() && data.topic.length <= 200 ? data.topic.trim() : null;
  const revision = data.revision === 'text' || data.revision === 'image' ? data.revision : null;
  return { reply: data.reply.trim(), setup, topic, revision };
}

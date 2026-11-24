import { BadGatewayException } from '@nestjs/common';
import type { TelegramChannelAiPlanningContextService } from './telegram-channel-ai-planning-context.service';
import type { TelegramAiPostingSourceService } from './telegram-ai-posting-source.service';
import { telegramAiPostingLanguageName } from './telegram-ai-posting-language';
import {
  editorialDescription,
  mandatoryChannelRules,
} from './telegram-ai-posting-prompts';
import { parseTelegramAiPostingJson } from './telegram-ai-posting-json';
import type { telegramAiPostingEditorialSelection } from './telegram-ai-posting-editorial-selection';
import type { TelegramAiPostingMediaPreference } from './telegram-ai-posting-media-preferences';
import { recentTelegramAiPostingHistory } from './telegram-ai-posting-learning';

export function telegramAiPostingPlanningContextText(
  context: Awaited<ReturnType<TelegramChannelAiPlanningContextService['read']>>,
) {
  return JSON.stringify({
    schedule: context.schedule,

  });
}

export function telegramAiPostingPlanPrompt(
  config: Record<string, any>,
  context: Awaited<ReturnType<TelegramAiPostingSourceService['collect']>>,
  calendar: string,
  count: number,
  previousDrafts: Array<{ topic: string; title: string; text: string }> = [],
  selections: ReturnType<typeof telegramAiPostingEditorialSelection>[] = [],
  media: Array<TelegramAiPostingMediaPreference | undefined> = [],
) {
  const language =
    telegramAiPostingLanguageName(
      (typeof config.language === 'string' ? config.language : '') ||
        context.editorialProfile.language,
    ) || 'English';
  const profile = editorialDescription(config);
  const recentHistory = recentTelegramAiPostingHistory(context.history);
  const lengthPolicy =
    config.variedLength === false
      ? 'Prefer a consistent medium length, expanding only when the topic needs more explanation.'
      : 'Choose each publication length automatically from the topic complexity; use short, medium or long as appropriate and do not force a pattern.';
  const slots = selections.map(({ sphere, parentSphere, rubric, lengths }, index) => ({
    position: index + 1,
    sphere: parentSphere?.name ?? sphere?.name,
    subSphere: parentSphere ? sphere?.name : undefined,
    scope: sphere?.description?.slice(0, 360),
    visual: media[index]?.name,
    rubric: rubric?.name,
    goal: rubric?.goal?.slice(0, 180),
    length: lengths.length === 1 ? lengths[0].name : undefined,
  }));
  const assignments = slots.some(({ sphere, rubric, length }) => sphere || rubric || length)
    ? `Treat the assigned subsphere as the required main subject, with the parent sphere as context. Use the assigned rubric and plan a topic that fits its length and visual direction. Choose different situations, people, objects or settings across the batch. If the assignment calls for a real portrait or documented interface, name the specific woman or product so a verifiable image can be found. For an open portrait assignment, prefer a person with genuine color photographs available. Return in that order, with no length or format prefixes. ASSIGNMENTS: ${JSON.stringify(slots)}.`
    : lengthPolicy;
  return `Return only JSON with {"topics":[string]}. Suggest exactly ${count} distinct Telegram post topics in ${language}. Each topic must be a single string of 8–180 characters. ${assignments} Avoid any duplicates or close paraphrases of existing, scheduled and previously evaluated test posts. Use editorial profile, allowed source material, publication calendar, spheres and rubrics.\nCHANNEL DESCRIPTION\n${profile.slice(0, 3000)}\n${mandatoryChannelRules(config)}\n${typeof config.learningBlock === 'string' ? config.learningBlock.slice(0, 1500) : 'ЧТО РАБОТАЕТ В КАНАЛЕ\nДанных пока мало.'}\nCHANNEL DATA ${JSON.stringify(context.editorialProfile).slice(0, 1500)}\nCALENDAR ${calendar.slice(0, 1500)}\nSOURCES ${JSON.stringify(context.sourceContexts).slice(0, 3500)}\nEXISTING POSTS ${JSON.stringify(context.existingPosts).slice(0, 3000)}\nHISTORY — только для защиты от повторов\n${JSON.stringify(recentHistory).slice(0, 1500)}\nPREVIOUS TEST BATCHES ${JSON.stringify(previousDrafts.map(({ topic, title }) => topic || title).filter(Boolean)).slice(0, 3500)}\nSPHERES ${JSON.stringify(config.spheres ?? []).slice(0, 3500)}; RUBRICS ${JSON.stringify(config.rubrics ?? []).slice(0, 3500)}`;
}

export function parseTelegramAiPostingTopics(reply: string, count: number) {
  const items: unknown = parseTelegramAiPostingJson(reply)?.topics;
  if (!Array.isArray(items) || items.length !== count)
    throw new BadGatewayException('AI_POSTING_PLAN_INVALID');

  const topics = items.map((item: unknown) => {
    const value = item && typeof item === 'object' && 'topic' in item ? item.topic : item;
    return typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ') : '';
  });
  if (topics.some((topic) => topic.length < 8 || topic.length > 500) ||
      new Set(topics.map((topic) => topic.toLowerCase())).size !== count)
    throw new BadGatewayException('AI_POSTING_PLAN_INVALID');
  return topics;
}

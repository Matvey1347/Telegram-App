import { BadGatewayException } from '@nestjs/common';
import type { TelegramChannelAiPlanningContextService } from './telegram-channel-ai-planning-context.service';
import type { TelegramAiPostingSourceService } from './telegram-ai-posting-source.service';
import { telegramAiPostingLanguageName } from './telegram-ai-posting-language';
import {
  editorialDescription,
  mandatoryChannelRules,
} from './telegram-ai-posting-prompts';
import { parseTelegramAiPostingJson } from './telegram-ai-posting-json';
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
  return `Return only JSON with {"topics":[string]}. Suggest exactly ${count} distinct Telegram post topics in ${language}. ${lengthPolicy} Avoid any duplicates or close paraphrases of existing, scheduled and previously evaluated test posts. Use editorial profile, allowed source material, publication calendar, spheres and rubrics.\nCHANNEL DESCRIPTION\n${profile.slice(0, 3000)}\n${mandatoryChannelRules(config)}\n${typeof config.learningBlock === 'string' ? config.learningBlock.slice(0, 1500) : 'ЧТО РАБОТАЕТ В КАНАЛЕ\nДанных пока мало.'}\nCHANNEL DATA ${JSON.stringify(context.editorialProfile).slice(0, 1500)}\nCALENDAR ${calendar.slice(0, 1500)}\nSOURCES ${JSON.stringify(context.sourceContexts).slice(0, 3500)}\nEXISTING POSTS ${JSON.stringify(context.existingPosts).slice(0, 3000)}\nHISTORY — только для защиты от повторов\n${JSON.stringify(recentHistory).slice(0, 1500)}\nPREVIOUS TEST BATCHES ${JSON.stringify(previousDrafts).slice(0, 1500)}\nSPHERES ${JSON.stringify(config.spheres ?? []).slice(0, 3500)}; RUBRICS ${JSON.stringify(config.rubrics ?? []).slice(0, 3500)}`;
}

export function parseTelegramAiPostingTopics(reply: string) {
  const parsed = parseTelegramAiPostingJson(reply);
  if (
    !parsed ||
    !Array.isArray(parsed.topics) ||
    parsed.topics.length > 5 ||
    !parsed.topics.every(
      (item: unknown) =>
        typeof item === 'string' &&
        item.trim().length >= 8 &&
        item.length <= 200,
    )
  )
    throw new BadGatewayException('AI_POSTING_PLAN_INVALID');
  return parsed.topics.map((item: string) => item.trim());
}

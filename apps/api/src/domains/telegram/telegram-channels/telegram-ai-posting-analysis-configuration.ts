import { randomUUID } from 'node:crypto';
import { BadGatewayException } from '@nestjs/common';
import { TELEGRAM_AI_POSTING_MAX_MEDIA_GUIDANCE_LENGTH } from '@telegram-system/shared';

type Row = Record<string, unknown>;

const record = (value: unknown): Row =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};

const rows = (value: unknown, limit = Infinity) =>
  Array.isArray(value) ? value.slice(0, limit).map((item) => ({ ...record(item) })) : [];

const text = (value: unknown, limit: number) =>
  typeof value === 'string' ? value.trim().slice(0, limit) : '';

function fill(existing: Row, suggested: Row, limits: Record<string, number>) {
  return Object.fromEntries(Object.entries(limits).flatMap(([key, limit]) => {
    const candidate = text(suggested[key], limit);
    return !text(existing[key], limit) && candidate ? [[key, candidate]] : [];
  }));
}

export function telegramAiPostingSphereWeights(value: unknown, spheres: unknown) {
  const weights = record(value);
  return Object.fromEntries(rows(spheres).flatMap(({ id, parentId }) => {
    if (parentId || typeof id !== 'string' || !Object.hasOwn(weights, id)) return [];
    const weight = weights[id];
    return typeof weight === 'number' && Number.isInteger(weight) && weight >= 0 && weight <= 100
      ? [[id, weight]] : [];
  })) as Record<string, number>;
}

export function telegramAiPostingAnalysisInput(config: Row) {
  const compact = (value: unknown, fields: Record<string, number>) =>
    rows(value, 100).map((item) => Object.fromEntries(Object.entries(fields).map(([key, limit]) => [
      key, Array.isArray(item[key]) ? item[key] : text(item[key], limit),
    ])));
  return {
    audience: text(config.audience, 900),
    topic: text(config.topic, 900),
    style: text(config.style, 1200),
    visualStyle: text(config.visualStyle, 850),
    spheres: compact(config.spheres, { id: 128, parentId: 128, name: 120, description: 200 }),
    rubrics: compact(config.rubrics, { id: 128, sphereId: 128, name: 120, description: 200, goal: 120, lengthIds: 100 }),
    mediaPreferences: compact(config.mediaPreferences, { id: 100, name: 80, description: 160, generationDescription: 160, searchDescription: 160 }),
    lengths: config.lengths,
  };
}

export function buildTelegramAiPostingAnalysisConfiguration(
  config: Row, reply: Row | null, detectedLanguage: string, configured: boolean,
  hasVisualEvidence: boolean,
) {
  const style = text(reply?.style, 1200);
  const findings = text(reply?.findings, 6500);
  if (!reply || !style || !findings)
    throw new BadGatewayException('AI_POSTING_CHANNEL_ANALYSIS_INVALID');

  const spheres = rows(config.spheres);
  const rubrics = rows(config.rubrics);
  const preferences = rows(config.mediaPreferences);
  const lengthIds = new Set(rows(config.lengths).map(({ id }) => id));
  const suggestedSpheres = rows(reply.spheres, 12);
  const sphereIds = new Map(spheres.map(({ id }) => [id, id]));
  if (!spheres.length) {
    for (const item of suggestedSpheres) {
      const key = text(item.id, 128);
      const name = text(item.name, 120);
      if (!key || !name || sphereIds.has(key)) continue;
      const id = randomUUID();
      sphereIds.set(key, id);
      spheres.push({
        id, name, parentId: null, tier: 'PRIMARY', emoji: '✨',
        description: text(item.description, 2000), sources: [], mediaPreferenceId: null,
      });
    }
  } else {
    for (const sphere of spheres) {
      Object.assign(sphere, fill(sphere, suggestedSpheres.find(({ id }) => id === sphere.id) ?? {}, { description: 2000 }));
    }
  }

  const suggestedRubrics = rows(reply.rubrics, 14);
  if (!rubrics.length) {
    for (const item of suggestedRubrics) {
      const name = text(item.name, 120);
      if (!name || rubrics.some((rubric) => rubric.name === name)) continue;
      rubrics.push({
        id: randomUUID(), name, sphereId: sphereIds.get(item.sphereId) ?? null, emoji: '📝',
        description: text(item.description, 2000), goal: text(item.goal, 1000),
        lengthIds: Array.isArray(item.lengthIds) ? item.lengthIds.filter((id) => lengthIds.has(id)) : [],
      });
    }
  } else {
    for (const rubric of rubrics) {
      Object.assign(rubric, fill(rubric, suggestedRubrics.find(({ id }) => id === rubric.id) ?? {}, { description: 2000, goal: 1000 }));
    }
  }
  if (hasVisualEvidence) {
    const limits = {
      description: 500,
      generationDescription: TELEGRAM_AI_POSTING_MAX_MEDIA_GUIDANCE_LENGTH,
      searchDescription: TELEGRAM_AI_POSTING_MAX_MEDIA_GUIDANCE_LENGTH,
    };
    const suggestedMedia = rows(reply.mediaPreferences, 12);
    if (!preferences.length) {
      for (const item of suggestedMedia) {
        const name = text(item.name, 80);
        const guidance = fill({}, item, limits);
        if (name && guidance.generationDescription && guidance.searchDescription) {
          preferences.push({ id: randomUUID(), name, description: '', emoji: '🎨', references: [], purpose: 'BOTH', ...guidance });
        }
      }
    } else {
      for (const preference of preferences) {
        Object.assign(preference, fill(preference, suggestedMedia.find(({ id }) => id === preference.id) ?? {}, limits));
      }
    }
  }
  const suggestedWeights = Object.fromEntries(suggestedSpheres.flatMap(({ id, weight }) =>
    typeof id === 'string' && sphereIds.has(id) ? [[String(sphereIds.get(id)), weight]] : [],
  ));
  const sphereWeights = telegramAiPostingSphereWeights({ ...suggestedWeights, ...record(config.sphereWeights) }, spheres);
  const language = text(config.language, 32) || detectedLanguage || text(reply.language, 32);
  return {
    findings,
    configuration: {
      ...config,
      ...fill(config, reply, { audience: 4000, topic: 4000 }),
      language,
      style,
      ...(hasVisualEvidence && reply.visualVariety === true ? { visualVariety: true } : {}),
      visualStyle: hasVisualEvidence ? text(reply.visualStyle, 850) || config.visualStyle : config.visualStyle,
      ...(!configured && ['start', 'contextual'].includes(String(reply.emojiPolicy)) ? { emojiPolicy: reply.emojiPolicy } : {}),
      ...(!configured && ['disabled', 'start', 'end', 'ending_inline'].includes(String(reply.hashtags)) ? { hashtags: reply.hashtags } : {}),
      spheres,
      rubrics,
      mediaPreferences: preferences,
      sphereWeights,
    },
  };
}

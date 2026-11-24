import type { TelegramAiPostingVisualDirection } from './telegram-ai-posting-visual-direction';
import { telegramAiPostingSphereWeights } from './telegram-ai-posting-analysis-configuration';
import { telegramAiPostingVisibleText } from './telegram-ai-posting-render';

type EditorialUse = {
  sphere?: { id?: string } | null;
  rubric?: { id?: string } | null;
};

export function telegramAiPostingEditorialSelection(
  config: Record<string, any>,
  editorialIndex: number,
  lengthIndex = editorialIndex,
  recent: EditorialUse[] = [],
  rubricBoost: ReadonlyMap<string, number> = new Map(),
) {
  const leastUsed = <T extends { id: string }>(choices: T[], field: keyof EditorialUse, offset: number) => {
    const usage = new Map<string, number>();
    for (const item of recent) {
      const id = item?.[field]?.id;
      if (id) usage.set(id, (usage.get(id) ?? 0) + 1);
    }
    const priority = (id: string) => (usage.get(id) ?? 0) - (field === 'rubric' ? rubricBoost.get(id) ?? 0 : 0);
    const minimum = Math.min(...choices.map(({ id }) => priority(id)));
    const available = choices.filter(({ id }) => priority(id) === minimum);
    return available[offset % available.length] ?? null;
  };
  const spheres = (
    Array.isArray(config.spheres)
      ? config.spheres
      : []
  ).filter(
    (item: any) =>
      item && typeof item.id === 'string',
  );
  const roots = spheres.filter((item: any) => !item.parentId);
  const primarySpheres = roots.filter(
    (item: any) => item.tier === 'PRIMARY',
  );
  const secondarySpheres = roots.filter(
    (item: any) => item.tier !== 'PRIMARY',
  );
  const desiredTier =
    editorialIndex % 2 === 0 ? primarySpheres : secondarySpheres;
  const sphereChoices = desiredTier.length
    ? desiredTier
    : primarySpheres.length
      ? primarySpheres
      : secondarySpheres;
  const parentUsage = recent.map((item) => ({
    sphere: roots.find(({ id }) => id === item.sphere?.id || spheres.some((sphere) => sphere.id === item.sphere?.id && sphere.parentId === id)),
  }));
  const rotation = Math.floor(editorialIndex / 2);
  const parentCounts = new Map<string, number>();
  for (const item of parentUsage) {
    if (item.sphere) parentCounts.set(item.sphere.id, (parentCounts.get(item.sphere.id) ?? 0) + 1);
  }
  const minimum = Math.min(...sphereChoices.map(({ id }) => parentCounts.get(id) ?? 0));
  const leastRepresented = sphereChoices.filter(({ id }) => (parentCounts.get(id) ?? 0) === minimum);
  const weights = telegramAiPostingSphereWeights(config.sphereWeights, roots);
  const weighted = Object.values(weights).some((weight) => weight > 0);
  const activeRoots = roots.filter(({ id }) => (weights[id] ?? 1) > 0);
  const totalWeight = activeRoots.reduce((total, { id }) => total + (weights[id] ?? 1), 0);
  const totalUsed = activeRoots.reduce((total, { id }) => total + (parentCounts.get(id) ?? 0), 0);
  const deficit = (id: string) =>
    ((weights[id] ?? 1) / totalWeight) * (totalUsed + 1) - (parentCounts.get(id) ?? 0);
  let parent = weighted
    ? [...activeRoots].sort((left, right) => deficit(right.id) - deficit(left.id))[0]
    : leastRepresented[rotation % leastRepresented.length] ?? null;
  const children = parent ? spheres.filter((item: any) => item.parentId === parent.id) : [];
  let selectedSphere = leastUsed(children, 'sphere', editorialIndex) ?? parent;
  const rubrics = (Array.isArray(config.rubrics) ? config.rubrics : []).filter(
    (item: any) => item && (!item.sphereId || spheres.some(({ id }) => id === item.sphereId)),
  );
  const textBudget = 4096 - telegramAiPostingVisibleText(String(config.ending ?? '')).length - 40;
  const lengths = (Array.isArray(config.lengths) ? config.lengths : [])
    .filter((item: any) => item && (item.minCharacters ?? 0) <= textBudget)
    .sort((left: any, right: any) => (left.minCharacters ?? 0) - (right.minCharacters ?? 0));
  const acceptsLength = (rubric: any, length: any) =>
    !rubric.lengthIds?.length || rubric.lengthIds.includes(length.id);
  const scopedRubrics = weighted ? rubrics.filter((rubric) =>
    !rubric.sphereId || [selectedSphere?.id, parent?.id].includes(rubric.sphereId),
  ) : rubrics;
  const usableLengths = lengths.filter((length) =>
    !scopedRubrics.length || scopedRubrics.some((rubric) => acceptsLength(rubric, length)),
  );
  const varietyOrder = [usableLengths[0], usableLengths.at(-1), ...usableLengths.slice(1, -1)]
    .filter((length, index, list) => length && list.indexOf(length) === index);
  const selectedLength = config.variedLength !== false && varietyOrder.length
    ? varietyOrder[lengthIndex % varietyOrder.length] : null;
  const compatibleRubrics = selectedLength ? rubrics.filter((rubric) => acceptsLength(rubric, selectedLength)) : rubrics;
  const compactRubrics = typeof selectedLength?.maxCharacters === 'number' && selectedLength.maxCharacters <= 99
    ? compatibleRubrics.filter((rubric) => (!weighted || scopedRubrics.includes(rubric)) && rubric.lengthIds?.length &&
      rubric.lengthIds.every((id: string) => lengths.find((length) => length.id === id)?.maxCharacters < 300)) : [];
  const compactRubric = leastUsed(compactRubrics, 'rubric', rotation);
  if (compactRubric?.sphereId) {
    const compactSphere = spheres.find(({ id }) => id === compactRubric.sphereId);
    if (compactSphere) {
      parent = compactSphere.parentId
        ? roots.find(({ id }) => id === compactSphere.parentId) ?? null
        : compactSphere;
      selectedSphere = compactSphere;
    }
  }
  const choices = compatibleRubrics.filter((rubric) =>
    !rubric.sphereId || [selectedSphere?.id, parent?.id].includes(rubric.sphereId),
  );
  const rubric = compactRubric ?? leastUsed(choices, 'rubric', editorialIndex);
  return {
    sphere: selectedSphere,
    parentSphere: selectedSphere?.parentId ? parent : null,
    rubric,
    lengths: selectedLength ? [selectedLength] : lengths.filter((length) => !rubric || acceptsLength(rubric, length)),
  };
}

export type TelegramAiPostingEditorialAssignment = {
  visualDirection?: TelegramAiPostingVisualDirection;
  visualMotif?: string;
  sphereId?: string;
  rubricId?: string;
  lengthId?: string;
};

export function restoreTelegramAiPostingEditorialSelection(
  config: Record<string, any>,
  saved: TelegramAiPostingEditorialAssignment,
  legacyVote = false,
): ReturnType<typeof telegramAiPostingEditorialSelection> {
  const spheres = Array.isArray(config.spheres) ? config.spheres : [];
  const rubrics = Array.isArray(config.rubrics) ? config.rubrics : [];
  const lengths = Array.isArray(config.lengths) ? config.lengths : [];
  const sphere = spheres.find((item) => item?.id === saved.sphereId) ?? null;
  const rubric = rubrics.find((item) => item?.id === saved.rubricId) ??
    (legacyVote ? rubrics.find((item) => !item?.sphereId && /дві реакції|две реакции|two reactions/iu.test(item?.name ?? '')) : null) ?? null;
  const allowed = lengths.filter((item) => !rubric?.lengthIds?.length || rubric.lengthIds.includes(item.id));
  const length = allowed.find((item) => item?.id === saved.lengthId);
  return {
    sphere,
    parentSphere: sphere?.parentId ? spheres.find((item) => item?.id === sphere.parentId) ?? null : null,
    rubric,
    lengths: length ? [length] : allowed,
  };
}

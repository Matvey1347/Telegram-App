function allocateTotal(
  ids: string[],
  total: number,
  rawWeights: Record<string, number>,
) {
  if (!ids.length) return {};
  const weights = ids.map((id) => Math.max(0, rawWeights[id] ?? 0));
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const basis = weightTotal > 0 ? weights : ids.map(() => 1);
  const basisTotal = basis.reduce((sum, weight) => sum + weight, 0);
  const exact = basis.map((weight) => (weight / basisTotal) * total);
  const allocated = exact.map(Math.floor);
  let remainder = total - allocated.reduce((sum, weight) => sum + weight, 0);
  const priority = ids
    .map((id, index) => ({
      id,
      index,
      fraction: exact[index] - allocated[index],
    }))
    .sort(
      (left, right) =>
        right.fraction - left.fraction || left.index - right.index,
    );

  for (const item of priority) {
    if (remainder <= 0) break;
    allocated[item.index] += 1;
    remainder -= 1;
  }

  return Object.fromEntries(ids.map((id, index) => [id, allocated[index]]));
}

export function normalizePlannerFormatWeights(
  formatIds: string[],
  weights: Record<string, number>,
) {
  return allocateTotal(
    formatIds,
    100,
    Object.fromEntries(
      formatIds.map((id) => [
        id,
        Math.min(100, Math.max(0, Number(weights[id] ?? 100))),
      ]),
    ),
  );
}

export function redistributePlannerFormatWeight(
  formatIds: string[],
  weights: Record<string, number>,
  changedFormatId: string,
  nextWeight: number,
) {
  if (formatIds.length <= 1) {
    return formatIds.length ? { [formatIds[0]]: 100 } : {};
  }
  const normalized = normalizePlannerFormatWeights(formatIds, weights);
  const changedWeight = Math.min(100, Math.max(0, Math.round(nextWeight)));
  const otherIds = formatIds.filter((id) => id !== changedFormatId);
  return {
    ...allocateTotal(otherIds, 100 - changedWeight, normalized),
    [changedFormatId]: changedWeight,
  };
}

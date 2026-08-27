export type TelegramAdSalesPriceAllocationTarget = {
  key: string;
  weight?: number | null;
};

export type TelegramAdSalesPriceAllocationShare = {
  key: string;
  amount: number;
};

/**
 * Allocates a two-decimal monetary total by caller-provided value weight. Integer minor
 * units and deterministic largest remainders guarantee an exact final sum.
 */
export function allocateTelegramAdSalesTotalPrice(
  total: number,
  targets: TelegramAdSalesPriceAllocationTarget[],
): TelegramAdSalesPriceAllocationShare[] {
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error("Total price must be positive");
  }
  const totalMinorUnits = Math.round(total * 100);
  if (
    !Number.isSafeInteger(totalMinorUnits) ||
    Math.abs(total * 100 - totalMinorUnits) > 1e-7
  ) {
    throw new Error("Total price must have at most two decimal places");
  }
  if (!targets.length) throw new Error("At least one target is required");
  if (new Set(targets.map((target) => target.key)).size !== targets.length) {
    throw new Error("Target keys must be unique");
  }
  if (totalMinorUnits < targets.length) {
    throw new Error("Total price must allocate at least 0.01 per target");
  }

  const hasPositiveWeight = targets.some(
    (target) => Number.isFinite(target.weight) && Number(target.weight) > 0,
  );
  const weighted = targets.map((target) => ({
    key: target.key,
    weight:
      hasPositiveWeight && Number(target.weight) > 0
        ? Number(target.weight)
        : 1,
  }));
  const divisor = weighted.reduce((sum, target) => sum + target.weight, 0);
  const base = weighted.map((target) => {
    const exact = (totalMinorUnits * target.weight) / divisor;
    const minorUnits = Math.floor(exact);
    return { ...target, exact, minorUnits, remainder: exact - minorUnits };
  });
  let unallocated =
    totalMinorUnits - base.reduce((sum, target) => sum + target.minorUnits, 0);
  const remainderOrder = [...base].sort(
    (left, right) =>
      right.remainder - left.remainder || left.key.localeCompare(right.key),
  );
  for (
    let index = 0;
    index < remainderOrder.length && unallocated > 0;
    index += 1
  ) {
    remainderOrder[index].minorUnits += 1;
    unallocated -= 1;
  }
  return base.map((target) => ({
    key: target.key,
    amount: target.minorUnits / 100,
  }));
}

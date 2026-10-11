export type FinancePageState = { page: number; pageSize: number };

export function resizeFinanceListPage(
  state: FinancePageState,
  isMobile: boolean,
): FinancePageState {
  const pageSize = isMobile ? 5 : 10;
  return state.pageSize === pageSize ? state : { page: 1, pageSize };
}

/** Returns the one-based page that contains a known item in the server order. */
export function financePageForItem(
  itemIds: readonly string[],
  itemId: string,
  pageSize: number,
) {
  const index = itemIds.indexOf(itemId);
  return index < 0 ? 1 : Math.floor(index / pageSize) + 1;
}

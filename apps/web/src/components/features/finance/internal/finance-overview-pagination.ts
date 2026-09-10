export type FinancePageState = { page: number; pageSize: number };

export function resizeFinanceListPage(
  state: FinancePageState,
  isMobile: boolean,
): FinancePageState {
  const pageSize = isMobile ? 5 : 10;
  return state.pageSize === pageSize ? state : { page: 1, pageSize };
}

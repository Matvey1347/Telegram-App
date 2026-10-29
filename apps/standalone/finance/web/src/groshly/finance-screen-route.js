const aliases = Object.freeze({
  billing: 'subscription',
  transactions: 'history',
  'regular-payments': 'recurring',
  settings: 'financeSettings',
});

export function normalizeFinanceScreen(screen) {
  return aliases[screen] || screen;
}

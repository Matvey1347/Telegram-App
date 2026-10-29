const key = 'finance-fx-rates-v1';
const currencies = ['UAH', 'PLN', 'USD', 'EUR'];

function valid(value) {
  if (!value || typeof value !== 'object' || !value.rates || typeof value.rates !== 'object') return false;
  if (typeof value.rateDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.rateDate)) return false;
  return currencies.every(currency => {
    const rate = value.rates[currency];
    return typeof rate === 'number' && Number.isFinite(rate) && rate > 0 && rate < 1_000_000;
  }) && value.rates.UAH === 1;
}

export function readFinanceRateCache() {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || 'null');
    return valid(value) ? { rates: value.rates, rateDate: value.rateDate, rateSource: 'cached' } : null;
  } catch {
    return null;
  }
}

export function writeFinanceRateCache(value) {
  if (!valid(value)) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify({ rates: value.rates, rateDate: value.rateDate }));
    return true;
  } catch {
    return false;
  }
}

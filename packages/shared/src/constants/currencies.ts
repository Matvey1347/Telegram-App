export const CURRENCIES = ['UAH', 'USD', 'EUR', 'PLN'] as const;

export type Currency = (typeof CURRENCIES)[number];

export type CurrencyPresentation = {
  code: string;
  symbol: string;
  flag: string;
};

const CURRENCY_REGIONS: Record<string, string> = {
  AED: 'AE', AFN: 'AF', ALL: 'AL', AMD: 'AM', ANG: 'CW', AOA: 'AO',
  ARS: 'AR', AUD: 'AU', AWG: 'AW', AZN: 'AZ', BAM: 'BA', BBD: 'BB',
  BDT: 'BD', BGN: 'BG', BHD: 'BH', BIF: 'BI', BMD: 'BM', BND: 'BN',
  BOB: 'BO', BRL: 'BR', BSD: 'BS', BTN: 'BT', BWP: 'BW', BYN: 'BY',
  BZD: 'BZ', CAD: 'CA', CDF: 'CD', CHF: 'CH', CLP: 'CL', CNY: 'CN',
  COP: 'CO', CRC: 'CR', CUC: 'CU', CUP: 'CU', CVE: 'CV', CZK: 'CZ',
  DJF: 'DJ', DKK: 'DK', DOP: 'DO', DZD: 'DZ', EGP: 'EG', ERN: 'ER',
  ETB: 'ET', EUR: 'EU', FJD: 'FJ', FKP: 'FK', GBP: 'GB', GEL: 'GE',
  GHS: 'GH', GIP: 'GI', GMD: 'GM', GNF: 'GN', GTQ: 'GT', GYD: 'GY',
  HKD: 'HK', HNL: 'HN', HRK: 'HR', HTG: 'HT', HUF: 'HU', IDR: 'ID',
  ILS: 'IL', INR: 'IN', IQD: 'IQ', IRR: 'IR', ISK: 'IS', JMD: 'JM',
  JOD: 'JO', JPY: 'JP', KES: 'KE', KGS: 'KG', KHR: 'KH', KMF: 'KM',
  KPW: 'KP', KRW: 'KR', KWD: 'KW', KYD: 'KY', KZT: 'KZ', LAK: 'LA',
  LBP: 'LB', LKR: 'LK', LRD: 'LR', LSL: 'LS', LYD: 'LY', MAD: 'MA',
  MDL: 'MD', MGA: 'MG', MKD: 'MK', MMK: 'MM', MNT: 'MN', MOP: 'MO',
  MRU: 'MR', MUR: 'MU', MVR: 'MV', MWK: 'MW', MXN: 'MX', MYR: 'MY',
  MZN: 'MZ', NAD: 'NA', NGN: 'NG', NIO: 'NI', NOK: 'NO', NPR: 'NP',
  NZD: 'NZ', OMR: 'OM', PAB: 'PA', PEN: 'PE', PGK: 'PG', PHP: 'PH',
  PKR: 'PK', PLN: 'PL', PYG: 'PY', QAR: 'QA', RON: 'RO', RSD: 'RS',
  RUB: 'RU', RWF: 'RW', SAR: 'SA', SBD: 'SB', SCR: 'SC', SDG: 'SD',
  SEK: 'SE', SGD: 'SG', SHP: 'SH', SLE: 'SL', SLL: 'SL', SOS: 'SO',
  SRD: 'SR', SSP: 'SS', STN: 'ST', SVC: 'SV', SYP: 'SY', SZL: 'SZ',
  THB: 'TH', TJS: 'TJ', TMT: 'TM', TND: 'TN', TOP: 'TO', TRY: 'TR',
  TTD: 'TT', TWD: 'TW', TZS: 'TZ', UAH: 'UA', UGX: 'UG', USD: 'US',
  UYU: 'UY', UZS: 'UZ', VES: 'VE', VND: 'VN', VUV: 'VU', WST: 'WS',
  XAF: 'CM', XCD: 'BQ', XCG: 'CW', XDR: 'UN', XOF: 'SN', XPF: 'PF',
  XSU: 'UN', YER: 'YE', ZAR: 'ZA', ZMW: 'ZM', ZWG: 'ZW', ZWL: 'ZW',
};

const SYMBOL_OVERRIDES: Record<string, string> = {
  AED: 'د.إ', ALL: 'L', ANG: 'ƒ', AWG: 'ƒ', BGN: 'лв', BHD: 'د.ب',
  BTN: 'Nu.', BYN: 'Br', CDF: 'FC', CHF: 'Fr.', CVE: '$', DJF: 'Fdj',
  DZD: 'دج', ETB: 'Br', EUR: '€', HTG: 'G', IQD: 'ع.د', IRR: '﷼',
  JOD: 'د.ا', KWD: 'د.ك', LSL: 'L', LYD: 'ل.د', MAD: 'د.م.', MDL: 'L',
  MKD: 'ден', MRU: 'UM', MZN: 'MT', OMR: 'ر.ع.', PAB: 'B/.', PEN: 'S/',
  PLN: 'zł', QAR: 'ر.ق', RSD: 'дин.', SAR: '﷼', SDG: 'ج.س.', SLL: 'Le',
  SOS: 'Sh', SVC: '₡', TJS: 'ЅМ', TMT: 'm', TND: 'د.ت', UAH: '₴',
  USD: '$', UZS: 'soʻm', VES: 'Bs.', XDR: 'SDR', XSU: 'SUCRE', YER: '﷼',
  ZWG: 'ZiG', ZWL: 'Z$',
};

function regionFlag(region: string): string {
  return [...region].map((letter) =>
    String.fromCodePoint(127397 + letter.charCodeAt(0)),
  ).join('');
}

function localizedCurrencySymbol(code: string, region: string): string {
  if (SYMBOL_OVERRIDES[code]) return SYMBOL_OVERRIDES[code];
  try {
    return new Intl.NumberFormat(`en-${region}`, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0).find((part) => part.type === 'currency')?.value ?? '¤';
  } catch {
    return '¤';
  }
}

export function currencyPresentation(currency: string): CurrencyPresentation {
  const code = currency.trim().toUpperCase();
  const region = CURRENCY_REGIONS[code] ?? 'UN';
  return {
    code,
    symbol: localizedCurrencySymbol(code, region),
    flag: regionFlag(region),
  };
}

export function currencySelectLabel(currency: string): string {
  const { code, symbol, flag } = currencyPresentation(currency);
  return `${flag} ${symbol} ${code}`;
}

export function currencyCodeFromSelection(value: string): string | null {
  const match = value.trim().toUpperCase().match(/(?:^|\s)([A-Z]{3})$/u);
  return match?.[1] ?? null;
}

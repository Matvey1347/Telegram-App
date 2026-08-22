const FALLBACK_TIMEZONES = [
  "UTC",
  "Europe/Kyiv",
  "Europe/Warsaw",
  "Europe/Berlin",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Tbilisi",
  "Asia/Tokyo",
  "Australia/Sydney",
] as const;

type IntlWithSupportedValues = typeof Intl & {
  supportedValuesOf?: (key: "timeZone") => string[];
};

/** Internal Finance administration timezone choices. */
export function financeAdminTimezoneOptions(current?: string | null) {
  const supportedValuesOf = (Intl as IntlWithSupportedValues).supportedValuesOf;
  const supported = supportedValuesOf
    ? supportedValuesOf.call(Intl, "timeZone")
    : [...FALLBACK_TIMEZONES];
  return Array.from(
    new Set(["UTC", ...(current ? [current] : []), ...supported]),
  ).sort((left, right) => left.localeCompare(right));
}

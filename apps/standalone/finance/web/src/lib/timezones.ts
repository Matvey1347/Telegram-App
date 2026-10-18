import { getTimeZones } from "@vvo/tzdb";

export type TimezonePresentation = { value: string; label: string; flag: string; utc: string; country: string };

function regionFlag(countryCode: string) {
  if (!/^[A-Z]{2}$/u.test(countryCode)) return "🌐";
  return [...countryCode].map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0))).join("");
}

function utcLabel(offsetMinutes: number) {
  if (offsetMinutes === 0) return "UTC";
  const sign = offsetMinutes < 0 ? "−" : "+";
  const absolute = Math.abs(offsetMinutes);
  return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

export function timezonePresentations(current?: string | null): TimezonePresentation[] {
  const source = getTimeZones({ includeUtc: true });
  const zones = source.map((zone) => ({
    value: zone.name === "Etc/UTC" ? "UTC" : zone.name,
    label: zone.name === "Etc/UTC" ? "UTC" : zone.name.replaceAll("_", " "),
    flag: regionFlag(zone.countryCode), utc: utcLabel(zone.currentTimeOffsetInMinutes),
    country: zone.countryName, offsetMinutes: zone.currentTimeOffsetInMinutes,
  }));
  if (current && !zones.some((zone) => zone.value === current)) {
    const alias = source.find((zone) => zone.group.includes(current));
    zones.push({
      value: current, label: current.replaceAll("_", " "),
      flag: alias ? regionFlag(alias.countryCode) : "🌐",
      utc: alias ? utcLabel(alias.currentTimeOffsetInMinutes) : "UTC",
      country: alias?.countryName ?? "", offsetMinutes: alias?.currentTimeOffsetInMinutes ?? 0,
    });
  }
  return zones
    .sort((left, right) => left.offsetMinutes - right.offsetMinutes || left.label.localeCompare(right.label))
    .map((zone) => ({
      value: zone.value,
      label: zone.label,
      flag: zone.flag,
      utc: zone.utc,
      country: zone.country,
    }));
}

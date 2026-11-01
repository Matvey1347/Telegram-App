import {
  normalizeInstagramProfile,
  type CrmInstagramMethod,
} from "@telegram-system/shared";
export function safeInstagramProfile(
  method: Pick<CrmInstagramMethod, "value" | "state">,
) {
  if (method.state !== "ACTIVE") return undefined;
  try {
    return normalizeInstagramProfile(method.value).profileUrl;
  } catch {
    return undefined;
  }
}
export function safeContactUrl(type: string, value: string) {
  if (type === "INSTAGRAM") {
    try {
      return normalizeInstagramProfile(value).profileUrl;
    } catch {
      return undefined;
    }
  }
  if (type === "TELEGRAM_USERNAME")
    return /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(value.replace(/^@/, ""))
      ? `https://t.me/${value.replace(/^@/, "")}`
      : undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

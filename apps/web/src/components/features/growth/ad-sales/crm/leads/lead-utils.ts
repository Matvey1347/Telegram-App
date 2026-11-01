import { normalizeInstagramProfile } from "@telegram-system/shared";
import type { LeadContact, LeadExport } from "@telegram-system/shared";
export const displayLeadDate = (value: string | null) =>
  value ? new Date(value).toLocaleString() : "No data";
export function leadSafeUrl(value: string | null) {
  if (!value) return undefined;
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function leadExportBlob(value: LeadExport) {
  if (
    value.contentBase64.length > 8_000_000 ||
    ![
      "text/csv",
      "text/csv; charset=utf-8",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ].includes(value.mimeType.split(";")[0].trim().toLowerCase())
  )
    throw new Error("Unsupported export");
  const bytes = Uint8Array.from(atob(value.contentBase64), (c) =>
    c.charCodeAt(0),
  );
  return new Blob([bytes], { type: value.mimeType });
}
export function downloadLeadExport(value: LeadExport) {
  const blob = leadExportBlob(value);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = value.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  a.click();
  URL.revokeObjectURL(url);
}

/** Open only public business references, never a messaging API or hidden profile scrape. */
export function leadBusinessContactUrl(contact: LeadContact) {
  if (
    !contact.confirmed ||
    !["ADVERTISER", "SALES_CONTACT"].includes(contact.role)
  )
    return undefined;
  if (contact.type === "TELEGRAM") {
    const name = contact.value.replace(/^@+/, "");
    return /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(name)
      ? `https://t.me/${name}`
      : undefined;
  }
  if (contact.type === "INSTAGRAM") {
    try {
      return normalizeInstagramProfile(contact.value).profileUrl;
    } catch {
      return undefined;
    }
  }
  return contact.type === "WEBSITE" ? leadSafeUrl(contact.value) : undefined;
}

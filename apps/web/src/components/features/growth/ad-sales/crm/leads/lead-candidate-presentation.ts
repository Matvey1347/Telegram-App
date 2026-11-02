import { normalizeInstagramProfile } from "@telegram-system/shared";
import type { LeadCandidateView, LeadContact } from "@telegram-system/shared";
import { leadSafeUrl } from "./lead-utils";

export type ContactCategory = "BUSINESS_CONTACT_FOUND" | "CONTACT_POINT_ONLY" | "CONTACT_NOT_FOUND" | "TARGET_UNRESOLVED";

export const contactCategoryLabel: Record<ContactCategory, string> = {
  BUSINESS_CONTACT_FOUND: "Бизнес-контакт найден",
  CONTACT_POINT_ONLY: "Только ссылка на проект",
  CONTACT_NOT_FOUND: "Контакт не найден",
  TARGET_UNRESOLVED: "Проект не установлен",
};

export function isBusinessContact(contact: LeadContact) {
  return contact.type !== "WEBSITE" &&
    !(contact.type === "TELEGRAM" && /bot$/i.test(contact.value.replace(/^@/, ""))) &&
    contact.role === "SALES_CONTACT" &&
    (contact.purpose === "CONTACT_FOR_ADS" || contact.purpose === "PROJECT_CONTACT") &&
    Boolean(contact.evidence?.trim());
}

export function candidateContactCategory(candidate: LeadCandidateView): ContactCategory {
  if (candidate.risks.some((risk) => ["UNRESOLVED_PROJECT", "IMAGE_EVIDENCE_UNVERIFIED"].includes(risk))) return "TARGET_UNRESOLVED";
  if (candidate.contacts.some(isBusinessContact)) return "BUSINESS_CONTACT_FOUND";
  if (candidate.contacts.some((contact) => contact.role === "ADVERTISED_DESTINATION")) return "CONTACT_POINT_ONLY";
  return "CONTACT_NOT_FOUND";
}

export function publicLeadUrl(contact: LeadContact) {
  if (contact.type === "TELEGRAM") {
    const name = contact.value.replace(/^@/, "");
    return /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(name) ? `https://t.me/${name}` : leadSafeUrl(contact.value);
  }
  if (contact.type === "INSTAGRAM") {
    try { return leadSafeUrl(normalizeInstagramProfile(contact.value).profileUrl); } catch { return undefined; }
  }
  if (contact.type === "WEBSITE") return leadSafeUrl(contact.value);
  return undefined;
}

export function contactDescription(contact: LeadContact) {
  if (contact.role === "ADVERTISED_DESTINATION") return "Ссылка на проект, не бизнес-контакт";
  if (isBusinessContact(contact)) return contact.purpose === "CONTACT_FOR_ADS" ? "Контакт для рекламы" : "Контакт для связи или заказа; связь с проектом не подтверждена";
  return "Назначение контакта не подтверждено";
}

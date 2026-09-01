"use client";

import { useEffect, type Dispatch, type SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TelegramAdvertiser } from "@telegram-system/shared";
import { telegramCrmApi } from "@/lib/features/growth/telegram-crm-api";
import { telegramCrmKeys } from "@/lib/features/growth/telegram-crm-query";

export function useCrmDealDeepLink(
  searchParams: Pick<URLSearchParams, "get">,
  setOpen: Dispatch<SetStateAction<boolean>>,
): TelegramAdvertiser | null {
  const contactId = searchParams.get("createDeal") === "1"
    ? searchParams.get("contactId")?.trim() || null
    : null;
  const query = useQuery({
    queryKey: contactId ? telegramCrmKeys.contactDetail(contactId) : telegramCrmKeys.contactDetail("none"),
    queryFn: ({ signal }) => telegramCrmApi.getContact(contactId!, signal),
    enabled: Boolean(contactId),
  });
  useEffect(() => {
    if (query.data) setOpen(true);
  }, [query.data, setOpen]);
  if (!query.data) return null;
  const contact = query.data;
  return {
    id: contact.id,
    workspaceId: contact.workspaceId,
    displayName: contact.displayName,
    companyName: contact.companyName,
    telegramUsername: contact.telegramUsername,
    telegramUserId: contact.peers[0]?.telegramUserId ?? null,
    phone: contact.phone,
    email: contact.email,
    website: contact.website,
    description: contact.description,
    source: contact.source,
    status: contact.archivedAt ? "ARCHIVED" : contact.stage === "LOST" ? "LOST" : "ACTIVE",
    lifecycleStage: contact.stage === "CUSTOMER" ? "CUSTOMER" : contact.stage === "QUALIFIED" ? "QUALIFIED" : "CONTACTED",
    ownerMemberId: contact.ownerMemberId,
    createdByUserId: null,
    lastContactAt: contact.lastContactAt,
    lastPurchaseAt: contact.lastPurchaseAt,
    nextContactAt: contact.nextContactAt,
    defaultFollowUpDays: null,
    preferredCurrency: null,
    preferredContactMethod: contact.telegramUsername ? "TELEGRAM_USERNAME" : null,
    totalSalesCount: contact.counts.deals,
    completedSalesCount: 0,
    totalPlacementsCount: 0,
    totalRevenueInPrimaryCurrency: "0",
    averageOrderValueInPrimaryCurrency: "0",
    firstPurchaseAt: null,
    repeatCustomerAt: null,
    archivedAt: contact.archivedAt,
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
  };
}

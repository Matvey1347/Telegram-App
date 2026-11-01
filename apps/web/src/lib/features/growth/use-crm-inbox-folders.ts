"use client";

import { useQuery } from "@tanstack/react-query";
import { listCrmInboxFolders } from "./crm-inbox-api";
import { telegramCrmKeys } from "./telegram-crm-query";

export function useCrmInboxFolders() {
  return useQuery({
    queryKey: telegramCrmKeys.inboxFolders(),
    queryFn: ({ signal }) => listCrmInboxFolders(signal),
    staleTime: 60_000,
  });
}

"use client";

import { Download, MessagesSquare, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import type {
  TelegramAccountFilter,
  TelegramChannelsTab,
} from "./telegram-channels-route-state";
import { PublicationSchedulesAction } from "./publication-schedules-action";

export function TelegramChannelsHeaderActions({
  tab,
  accountFilter,
  hasChannels,
  onCreateNetwork,
  onConnectAccount,
  onOpenTemplates,
  onSyncAll,
  onExport,
  onImport,
}: {
  tab: TelegramChannelsTab;
  accountFilter: TelegramAccountFilter;
  hasChannels: boolean;
  onCreateNetwork: () => void;
  onConnectAccount: () => void;
  onOpenTemplates: () => void;
  onSyncAll: () => void;
  onExport: () => void;
  onImport: () => void;
}) {
  if (tab === "networks") {
    return <Button onClick={onCreateNetwork}>Create network</Button>;
  }
  if (tab === "accounts" && accountFilter === "mtproto") {
    return <Button onClick={onConnectAccount}>Connect account</Button>;
  }
  if (tab !== "channels") return <Button onClick={onImport}>Import</Button>;
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <PublicationSchedulesAction />
      <Button
        type="button"
        variant="secondary"
        onClick={onOpenTemplates}
        className="inline-flex items-center gap-2"
      >
        <MessagesSquare size={16} />
        Message templates
      </Button>
      <Button
        type="button"
        variant="secondary"
        onClick={onSyncAll}
        className="inline-flex items-center gap-2"
      >
        <RefreshCw size={16} />
        Sync all channels
      </Button>
      <Button
        type="button"
        variant="secondary"
        onClick={onExport}
        disabled={!hasChannels}
        className="inline-flex items-center gap-2"
      >
        <Download size={16} />
        Export
      </Button>
      <Button onClick={onImport}>Import</Button>
    </div>
  );
}

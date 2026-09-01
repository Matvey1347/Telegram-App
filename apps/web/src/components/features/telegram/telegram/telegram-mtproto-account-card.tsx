"use client";

import { formatDateTime } from "@/lib/date-format";

import type { ReactNode } from "react";
import { RefreshCw, SearchCheck, Trash2 } from "lucide-react";
import type { TelegramUserAccount } from "@/lib/api";
import { Button } from "@/components/ui/primitives";
import { ChannelPreview } from "./channel-preview";
import { requiresTelegramSessionRefresh } from "./telegram-account-session-recovery";
import {
  TelegramCardActionsMenu,
  TelegramCardMenuAction,
} from "./telegram-card-actions-menu";
import { TelegramCrmAccountCapabilities } from "./telegram-crm-account-capabilities";

function displayName(account: TelegramUserAccount) {
  const username = String(account.username || "").replace(/^@/, "");
  return username ? `@${username}` : account.label;
}

export function TelegramMtprotoAccountCard({
  account,
  isStartingLogin,
  onStartLogin,
  onRefreshQr,
  onEnterCode,
  onPassword,
  onCheck,
  onSync,
  onDelete,
  children,
}: {
  account: TelegramUserAccount;
  isStartingLogin: boolean;
  onStartLogin: () => void;
  onRefreshQr: () => void;
  onEnterCode: () => void;
  onPassword: () => void;
  onCheck: () => void;
  onSync: () => void;
  onDelete: () => void;
  children?: ReactNode;
}) {
  const sessionRefreshRequired = requiresTelegramSessionRefresh(account);
  const fullName = [account.firstName, account.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    <article className="rounded-xl border border-neutral-800/80 bg-neutral-900/55 p-4 text-sm text-neutral-300">
      <ChannelPreview
        channel={{ title: displayName(account), photoUrl: account.photoUrl }}
        avatarKind="mtproto"
        subtitle={fullName || `Phone: ${account.phoneMasked || "-"}`}
        badges={
          account.isPremium ? (
            <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-amber-200">
              Premium
            </span>
          ) : null
        }
        rightAction={
          <TelegramCardActionsMenu
            label={`Actions for ${displayName(account)}`}
          >
            <TelegramCardMenuAction
              label="Check account"
              icon={<SearchCheck size={17} />}
              onClick={onCheck}
            />
            <TelegramCardMenuAction
              label="Sync channels"
              icon={<RefreshCw size={17} />}
              onClick={onSync}
            />
            <TelegramCardMenuAction
              danger
              label="Delete account"
              icon={<Trash2 size={17} />}
              onClick={onDelete}
            />
          </TelegramCardActionsMenu>
        }
        className="!mb-0 !border-0 !bg-transparent !p-0"
      />

      {account.status !== "connected" ? (
        <div className="mb-1 mt-3 flex items-center gap-2 text-xs uppercase tracking-wide text-amber-300">
          Status: {account.status}
        </div>
      ) : null}
      <div className="mt-3 space-y-1 text-sm">
        <p>Phone: {account.phoneMasked || "-"}</p>
        <p>
          Last Check:{" "}
          {account.lastCheckedAt
            ? formatDateTime(account.lastCheckedAt)
            : "-"}
        </p>
        {account.lastErrorMessage ? (
          <p className="text-rose-300">{account.lastErrorMessage}</p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {account.status === "pending" ||
        (account.status === "error" && !sessionRefreshRequired) ? (
          <Button
            variant="secondary"
            disabled={isStartingLogin}
            onClick={onStartLogin}
          >
            {isStartingLogin ? "Sending…" : "Start login"}
          </Button>
        ) : null}
        {sessionRefreshRequired ? (
          <Button variant="secondary" onClick={onRefreshQr}>
            Refresh via QR
          </Button>
        ) : null}
        {account.status === "needs_code" ? (
          <>
            <Button variant="secondary" onClick={onEnterCode}>
              Enter code
            </Button>
            <Button variant="secondary" onClick={onRefreshQr}>
              Login via QR
            </Button>
          </>
        ) : null}
        {account.status === "needs_password" ? (
          <Button variant="secondary" onClick={onPassword}>
            2FA password
          </Button>
        ) : null}
      </div>
      <TelegramCrmAccountCapabilities account={account} />
      {children}
    </article>
  );
}

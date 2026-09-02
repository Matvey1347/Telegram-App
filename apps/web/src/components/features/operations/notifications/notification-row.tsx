"use client";

import type { OperationsNotificationItem } from "@telegram-system/shared";
import { AlertTriangle, ArrowUpRight, BellRing } from "lucide-react";
import Link from "next/link";
import { formatDateTime } from "@/lib/date-format";

const TYPE_LABELS: Record<OperationsNotificationItem["type"], string> = {
  CRM_MESSAGE_RECEIVED: "Message received",
  CRM_FOLLOW_UP_DUE: "Follow-up due",
  CRM_AUTOMATION_BLOCKED: "Automation blocked",
  CRM_PLACEMENT_FAILURE: "Placement failure",
};

export function NotificationRow({
  notification,
  onOpen,
}: {
  notification: OperationsNotificationItem;
  onOpen: (notification: OperationsNotificationItem) => void;
}) {
  const unread = !notification.readAt;
  const lowPriority = notification.priority === "LOW";
  return (
    <Link
      href={notification.targetUrl}
      onClick={() => onOpen(notification)}
      aria-label={`${unread ? "Unread " : ""}${notification.title}`}
      className={`group block border-b border-neutral-800/80 px-4 py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
        unread ? "bg-blue-950/20 hover:bg-blue-950/30" : "hover:bg-neutral-900"
      } ${lowPriority ? "opacity-75" : ""}`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-300">
          {notification.priority === "HIGH" ? (
            <AlertTriangle size={16} aria-hidden="true" />
          ) : (
            <BellRing size={15} aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            {notification.priority === "HIGH" ? (
              <span className="rounded border border-amber-800/80 bg-amber-950/35 px-1.5 py-0.5 text-amber-300">
                High priority
              </span>
            ) : null}
            {notification.priority === "LOW" ? (
              <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-neutral-500">
                Low priority
              </span>
            ) : null}
            <span>{TYPE_LABELS[notification.type]}</span>
          </span>
          <span className="mt-1 flex items-start gap-2">
            {unread ? (
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-400" />
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-neutral-100">
                {notification.title}
              </span>
              <span className="mt-0.5 block text-sm leading-5 text-neutral-400">
                {notification.body}
              </span>
            </span>
            <ArrowUpRight
              size={14}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-neutral-600 transition group-hover:text-neutral-300"
            />
          </span>
          <span className="mt-1.5 flex items-center gap-2 text-xs text-neutral-600">
            {unread ? <span className="text-blue-300">Unread</span> : null}
            <time dateTime={notification.createdAt}>
              {formatDateTime(notification.createdAt)}
            </time>
          </span>
        </span>
      </div>
    </Link>
  );
}

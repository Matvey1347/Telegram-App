"use client";

import { Copy, EllipsisVertical, Reply } from "lucide-react";
import { useRef } from "react";
import type { ConsumerFinanceAssistantMessage } from "@telegram-system/shared";
import type { financeAssistantCopy } from "@consumer-finance/web/components/i18n/assistant";

export function FinanceAssistantMessageActions({
  message,
  onReply,
  t,
}: {
  message: ConsumerFinanceAssistantMessage & {
    replyTo?: ConsumerFinanceAssistantMessage;
  };
  onReply: () => void;
  t: ReturnType<typeof financeAssistantCopy>;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  function closeMenu() {
    if (menu.current) menu.current.open = false;
  }

  async function copyMessage() {
    closeMenu();
    trigger.current?.focus();
    try {
      await navigator.clipboard.writeText(message.text);
    } catch {
      const selection = document.createElement("textarea");
      selection.value = message.text;
      selection.style.position = "fixed";
      selection.style.opacity = "0";
      document.body.append(selection);
      selection.select();
      document.execCommand("copy");
      selection.remove();
      trigger.current?.focus();
    }
  }

  return (
    <div className={`groshly-assistant-message ${message.role}`}>
      <div className="groshly-assistant-message-body">
        <span className="groshly-assistant-author">
          {message.role === "user" ? t.you : t.title}
        </span>
        <div className="bubble" translate="no">
          {message.replyTo && <blockquote>{message.replyTo.text}</blockquote>}
          <span>{message.text}</span>
          <details
            ref={menu}
            className="groshly-assistant-message-actions"
            onToggle={(event) => {
              if (event.currentTarget.open)
                event.currentTarget
                  .querySelector(".groshly-assistant-action-menu")
                  ?.scrollIntoView?.({ block: "nearest" });
            }}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) closeMenu();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                closeMenu();
                trigger.current?.focus();
              }
            }}
          >
            <summary ref={trigger} aria-label={t.messageActions}>
              <EllipsisVertical size={20} aria-hidden />
            </summary>
            <div className="groshly-assistant-action-menu">
              <button
                type="button"
                onClick={() => {
                  closeMenu();
                  onReply();
                }}
              >
                <Reply size={17} aria-hidden />
                <span>{t.reply}</span>
              </button>
              <button
                type="button"
                onClick={() => void copyMessage()}
              >
                <Copy size={17} aria-hidden />
                <span>{t.copyMessage}</span>
              </button>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

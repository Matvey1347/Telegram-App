"use client";

import {
  Braces,
  ChevronDown,
  Heading,
  Link as LinkIcon,
  MousePointerClick,
  Quote,
  Settings2,
  Sigma,
  SmilePlus,
  Table2,
  type LucideIcon,
} from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { EditorCommandId } from "@telegram-system/shared";
import { editorWrapActions } from "./telegram-text-editor-commands";
import { useI18n } from "@/providers/i18n-provider";

export function TelegramTextEditorToolbar({
  disabled,
  hasButtons,
  singleRow = false,
  onCommand,
  onHeading,
  onPullQuoteWithAuthor,
  onConfigure,
}: {
  disabled?: boolean;
  hasButtons: boolean;
  singleRow?: boolean;
  onCommand: (command: EditorCommandId) => void;
  onHeading: (level: number) => void;
  onPullQuoteWithAuthor: () => void;
  onConfigure: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState<"heading" | "quote" | null>(null);
  const closeMenu = useCallback(() => setOpen(null), []);
  const select = (action: () => void) => {
    action();
    closeMenu();
  };
  const wrapLabels: Partial<Record<EditorCommandId, string>> = {
    bold: t("telegram.posts.editorComponents.format.bold"),
    italic: t("telegram.posts.editorComponents.format.italic"),
    underline: t("telegram.posts.editorComponents.format.underline"),
    strikethrough: t("telegram.posts.editorComponents.format.strikethrough"),
    spoiler: t("telegram.posts.editorComponents.format.spoiler"),
    inlineCode: t("telegram.posts.editorComponents.format.inlineCode"),
  };
  const primaryActions: ReactNode[] = [
    ...editorWrapActions.map(({ id, icon }) => (
      <ToolbarButton
        key={id}
        label={wrapLabels[id]!}
        icon={icon}
        disabled={disabled}
        onClick={() => onCommand(id)}
      />
    )),
    <ToolbarDivider key="primary-divider" />,
    <ToolbarButton
      key="code-block"
      label={t("telegram.posts.editorComponents.format.codeBlock")}
      icon={Braces}
      disabled={disabled}
      onClick={() => onCommand("codeBlock")}
    />,
    <ToolbarMenu
      key="quote"
      label={t("telegram.posts.editorComponents.format.quote")}
      icon={Quote}
      open={open === "quote"}
      disabled={disabled}
      onToggle={() => setOpen(open === "quote" ? null : "quote")}
      onClose={closeMenu}
    >
      <MenuItem
        icon={Quote}
        label={t("telegram.posts.editorComponents.format.quote")}
        onClick={() => select(() => onCommand("quote"))}
      />
      <MenuItem
        icon={Quote}
        label={t("telegram.posts.editorComponents.format.pullQuote")}
        onClick={() => select(() => onCommand("pullQuote"))}
      />
      <MenuItem
        icon={Quote}
        label={t("telegram.posts.editorComponents.format.pullQuoteWithAuthor")}
        onClick={() => select(onPullQuoteWithAuthor)}
      />
    </ToolbarMenu>,
  ];
  const secondaryActions: ReactNode[] = [
    <ToolbarMenu
      key="heading"
      label={t("telegram.posts.editorComponents.format.heading")}
      icon={Heading}
      open={open === "heading"}
      disabled={disabled}
      onToggle={() => setOpen(open === "heading" ? null : "heading")}
      onClose={closeMenu}
    >
      {[1, 2, 3, 4, 5, 6].map((level) => (
        <MenuItem
          key={level}
          icon={Heading}
          label={t("telegram.posts.editorComponents.format.headingLevel", {
            level,
          })}
          onClick={() => select(() => onHeading(level))}
        />
      ))}
    </ToolbarMenu>,
    <ToolbarButton
      key="table"
      label={t("telegram.posts.editorComponents.format.table")}
      icon={Table2}
      disabled={disabled}
      onClick={() => onCommand("table")}
    />,
    <ToolbarButton
      key="formula"
      label={t("telegram.posts.editorComponents.format.formula")}
      icon={Sigma}
      disabled={disabled}
      onClick={() => onCommand("formula")}
    />,
    <ToolbarDivider key="secondary-divider" />,
    <ToolbarButton
      key="link"
      label={t("telegram.posts.editorComponents.format.insertLink")}
      icon={LinkIcon}
      disabled={disabled}
      onClick={() => onCommand("link")}
    />,
    <ToolbarButton
      key="emoji"
      label={t("telegram.posts.editorComponents.format.emoji")}
      icon={SmilePlus}
      disabled={disabled}
      onClick={() => onCommand("emoji")}
    />,
    ...(hasButtons
      ? [
          <ToolbarButton
            key="buttons"
            label={t("telegram.posts.editorComponents.inlineButtons.title")}
            icon={MousePointerClick}
            disabled={disabled}
            onClick={() => onCommand("buttons")}
          />,
        ]
      : []),
    <ToolbarButton
      key="configure"
      label={t("telegram.posts.editorComponents.shortcuts.configure")}
      icon={Settings2}
      disabled={disabled}
      onClick={onConfigure}
    />,
  ];
  const actions = [...primaryActions, ...secondaryActions];
  return (
    <div
      role="toolbar"
      data-layout={singleRow ? "single-row" : "responsive"}
      className={`border-b border-neutral-700 bg-neutral-950/70 ${singleRow ? "overflow-x-auto" : "overflow-hidden"}`}
    >
      {singleRow ? (
        <div
          data-toolbar-single-row="true"
          className="flex min-w-max flex-nowrap items-center gap-2 py-1.5"
        >
          {actions}
        </div>
      ) : (
        <div
          data-toolbar-responsive-layout="true"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5"
        >
          {actions}
        </div>
      )}
    </div>
  );
}

function ToolbarDivider() {
  return (
    <span
      aria-hidden="true"
      data-toolbar-divider="true"
      className="h-6 w-px shrink-0 bg-neutral-700"
    />
  );
}

function ToolbarButton({
  label,
  icon: Icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-300 transition hover:bg-neutral-800 hover:text-white disabled:opacity-40"
    >
      <Icon size={17} />
    </button>
  );
}

function ToolbarMenu({
  label,
  icon,
  open,
  disabled,
  onToggle,
  onClose,
  children,
}: {
  label: string;
  icon: LucideIcon;
  open: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const Icon = icon;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const gap = 6;
      const padding = 8;
      const width = Math.min(224, window.innerWidth - padding * 2);
      const left = Math.min(
        Math.max(rect.left, padding),
        window.innerWidth - width - padding,
      );
      const spaceBelow = window.innerHeight - rect.bottom - padding;
      const openUp = spaceBelow < 220 && rect.top > spaceBelow;
      setMenuStyle({
        position: "fixed",
        left,
        width,
        maxHeight: Math.max(120, Math.min(320, openUp ? rect.top : spaceBelow)),
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + gap }
          : { top: rect.bottom + gap }),
      });
    };
    update();
    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      onClose();
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [onClose, open]);
  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onToggle}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-300 hover:bg-neutral-800 hover:text-white disabled:opacity-40"
      >
        <Icon
          size={17}
          className={Icon === Heading ? "translate-x-px" : undefined}
        />
        <ChevronDown
          size={11}
          aria-hidden="true"
          className="absolute -right-0.5 bottom-0.5"
        />
      </button>
      {open && menuStyle
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={menuStyle}
              className="z-[200] overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-950 p-1 shadow-2xl"
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800"
    >
      <Icon size={16} />
      <span>{label}</span>
    </button>
  );
}

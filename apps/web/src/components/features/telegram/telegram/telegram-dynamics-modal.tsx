"use client";

import type { ReactNode } from "react";
import { Modal } from "@/components/ui/primitives";

export function TelegramDynamicsModal({
  open,
  onClose,
  title,
  leadingHeaderAction,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  leadingHeaderAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="xl"
      leadingHeaderAction={leadingHeaderAction}
    >
      {children}
    </Modal>
  );
}

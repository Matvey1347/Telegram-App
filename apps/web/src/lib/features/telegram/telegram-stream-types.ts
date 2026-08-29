import type { BulkActionResultItem } from "@telegram-system/shared";

export type BulkProgressHandler = (
  item: BulkActionResultItem,
  current: number,
  total: number,
) => void;

export type StreamProgressHandler<TItem = BulkActionResultItem> = (
  item: TItem,
  current: number,
  total: number,
) => void;

export type StreamBatchItem = {
  index: number;
  success: boolean;
  action: string;
  message?: string;
  error?: string;
  title?: string;
  groupId?: string;
  slotId?: string;
};

export type StreamBatchResult = {
  total: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  results: StreamBatchItem[];
};

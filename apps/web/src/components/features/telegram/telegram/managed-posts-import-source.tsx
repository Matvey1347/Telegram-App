"use client";

import { useState, type ClipboardEvent, type DragEvent } from "react";
import { Copy, FileUp, RotateCcw, Upload } from "lucide-react";
import {
  Button,
  CustomSelect,
  FormField,
  Modal,
  Textarea,
} from "@/components/ui/primitives";

export type ManagedPostsGroupOption = {
  value: string;
  label: string;
  iconEmoji?: string;
  iconUrl?: string;
  iconFallback?: string;
};

export function ManagedPostsImportSource({
  content,
  fileName,
  disabled,
  onContent,
  onFile,
  onClear,
  onCopyContent,
}: {
  content: string;
  fileName: string | null;
  disabled: boolean;
  onContent: (content: string) => void;
  onFile: (file: File) => void;
  onClear: () => void;
  onCopyContent: () => void;
}) {
  const [dragging, setDragging] = useState(false);

  const paste = (event: ClipboardEvent<HTMLElement>) => {
    if (disabled) return;
    const file = event.clipboardData.files[0];
    if (file) {
      event.preventDefault();
      onFile(file);
      return;
    }
    const text = event.clipboardData.getData("text/plain");
    if (!content && text) {
      event.preventDefault();
      onContent(text);
    }
  };

  const drop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div className="space-y-3">
      <FormField label="Import data">
        {content ? (
          <div className="overflow-hidden rounded-lg border border-neutral-700 bg-neutral-950 focus-within:border-blue-600">
            <div className="flex items-center justify-between gap-2 border-b border-neutral-800 px-2 py-1.5">
              <span className="min-w-0 truncate text-xs text-neutral-400">
                {fileName ?? "Pasted text"}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 w-[104px] px-2 py-0 text-sm"
                  aria-label="Copy import data"
                  disabled={disabled}
                  onClick={onCopyContent}
                >
                  <Copy size={12} /> Copy
                </Button>
                <label
                  className={`inline-flex h-9 w-[104px] items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-neutral-700 px-2 py-0 text-sm font-medium text-white hover:bg-neutral-600 ${
                    disabled
                      ? "cursor-not-allowed opacity-50"
                      : "cursor-pointer"
                  }`}
                >
                  <RotateCcw size={12} /> Replace
                  <input
                    type="file"
                    accept=".json,.csv,.tsv,.txt,application/json,text/csv,text/tab-separated-values,text/plain"
                    className="sr-only"
                    disabled={disabled}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) onFile(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 w-[104px] px-2 py-0 text-sm"
                  disabled={disabled}
                  onClick={onClear}
                >
                  Clear
                </Button>
              </div>
            </div>
            <Textarea
              value={content}
              onChange={(event) => onContent(event.target.value)}
              onPaste={paste}
              rows={7}
              disabled={disabled}
              aria-label="Import data"
              className="rounded-none border-0 font-mono text-xs focus:ring-0"
            />
          </div>
        ) : (
          <label
            className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-neutral-950 px-4 py-5 text-center transition ${
              dragging
                ? "border-blue-500 bg-blue-950/30 text-white"
                : "border-neutral-700 text-neutral-300 hover:border-blue-600 hover:text-white"
            }`}
            onPaste={paste}
            onDragEnter={() => setDragging(true)}
            onDragLeave={() => setDragging(false)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={drop}
            tabIndex={disabled ? -1 : 0}
          >
            <span className="inline-flex items-center gap-2 text-sm font-medium">
              <FileUp size={18} /> Drop, paste, or choose a file
            </span>
            <span className="text-xs text-neutral-500">
              JSON, CSV, TSV, TXT, or plain text
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-blue-300">
              <Upload size={12} /> Text pasted here opens the editor
              automatically
            </span>
            <input
              type="file"
              accept=".json,.csv,.tsv,.txt,application/json,text/csv,text/tab-separated-values,text/plain"
              className="sr-only"
              disabled={disabled}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onFile(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        )}
      </FormField>
    </div>
  );
}

export function ManagedPostsGroupConfirmation({
  option,
  rowCount,
  onClose,
  onConfirm,
}: {
  option: ManagedPostsGroupOption | null;
  rowCount: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={Boolean(option)}
      onClose={onClose}
      title="Apply group to all posts"
      size="sm"
    >
      <p className="text-sm text-neutral-300">
        This will set{" "}
        <span className="font-semibold text-white">{option?.label}</span> for
        all {rowCount} imported posts and update every groupId in the JSON.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" onClick={onConfirm}>
          Apply group
        </Button>
      </div>
    </Modal>
  );
}

export function ManagedPostsGroupSelect({
  value,
  options,
  loading,
  disabled,
  error,
  onChange,
}: {
  value?: string;
  options: ManagedPostsGroupOption[];
  loading: boolean;
  disabled: boolean;
  error: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <FormField label="Group for all posts">
      <CustomSelect
        value={value}
        onChange={onChange}
        options={options}
        disabled={loading || disabled}
        placeholder={loading ? "Loading groups..." : "Choose a group override"}
      />
      {error ? (
        <p className="mt-1 text-xs text-amber-300">
          Could not load post groups. Posts can still be imported ungrouped.
        </p>
      ) : (
        <p className="mt-1 text-xs text-neutral-500">
          Changing this value updates groupId in every imported row.
        </p>
      )}
    </FormField>
  );
}

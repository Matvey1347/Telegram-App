"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { GreeterButtonRows } from "@telegram-system/shared";
import { Plus, Trash2 } from "lucide-react";
import { TelegramTextEditor } from "@/components/features/telegram/telegram/telegram-text-editor";
import { TelegramPostPreview } from "@/components/features/telegram/telegram/telegram-post-preview";
import { Button, Card, FormField, Input } from "@/components/ui/primitives";
import { greeterApi } from "@/lib/api";

export function GreeterMessageEditor({
  botId,
  text,
  buttons,
  onTextChange,
  onButtonsChange,
  channelTitle = "Greeter bot",
}: {
  botId: string;
  text: string;
  buttons: GreeterButtonRows;
  onTextChange: (value: string) => void;
  onButtonsChange: (value: GreeterButtonRows) => void;
  channelTitle?: string;
}) {
  const [previewText, setPreviewText] = useState<string | null>(null);
  const preview = useMutation({
    mutationFn: () => greeterApi.previewTemplate(botId, text, {}, buttons),
    onSuccess: (data) => setPreviewText(data.renderedText),
  });
  const flat = buttons.map((row) => row[0]).filter(Boolean);
  const updateButton = (index: number, field: "text" | "url", value: string) =>
    onButtonsChange(
      flat.map((button, itemIndex) => [
        itemIndex === index ? { ...button, [field]: value } : button,
      ]),
    );
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <FormField label="Message">
          <TelegramTextEditor
            value={text}
            onChange={(value) => {
              onTextChange(value);
              setPreviewText(null);
            }}
            rows={8}
          />
        </FormField>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-neutral-200">URL buttons</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                onButtonsChange([
                  ...buttons,
                  [{ text: "Open", url: "https://" }],
                ])
              }
            >
              <Plus size={15} />
            </Button>
          </div>
          <div className="space-y-2">
            {flat.map((button, index) => (
              <div
                key={index}
                className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]"
              >
                <Input
                  aria-label={`Button ${index + 1} label`}
                  value={button.text}
                  onChange={(e) => updateButton(index, "text", e.target.value)}
                  placeholder="Label"
                />
                <Input
                  aria-label={`Button ${index + 1} URL`}
                  value={button.url}
                  onChange={(e) => updateButton(index, "url", e.target.value)}
                  placeholder="https://"
                />
                <Button
                  type="button"
                  variant="danger"
                  onClick={() =>
                    onButtonsChange(
                      buttons.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => preview.mutate()}
          disabled={!text || preview.isPending}
        >
          {preview.isPending ? "Rendering" : "Render variables"}
        </Button>
        {preview.isError ? (
          <p className="text-sm text-rose-300">
            Could not render the template.
          </p>
        ) : null}
      </div>
      <Card>
        <h3 className="mb-3 font-semibold text-white">Preview</h3>
        <TelegramPostPreview
          channelTitle={channelTitle}
          text={previewText ?? text}
          imageUrls={[]}
        />
        {flat.map((button, index) => (
          <a
            key={index}
            href={button.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block rounded-lg bg-blue-600 px-3 py-2 text-center text-sm text-white"
          >
            {button.text || "Button"}
          </a>
        ))}
      </Card>
    </div>
  );
}

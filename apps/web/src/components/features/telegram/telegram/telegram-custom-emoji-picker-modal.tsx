"use client";

import { Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import type {
  TelegramCustomEmoji,
  TelegramCustomEmojiPackSummary,
} from "@telegram-system/shared";
import { emojiIcons } from "@/lib/emoji-icons";
import { Button, Input, Modal } from "@/components/ui/primitives";
import { useI18n } from "@/providers/i18n-provider";
import { TelegramCustomEmojiRenderer } from "./telegram-custom-emoji";

type Props = {
  open: boolean;
  onClose: () => void;
  packs: TelegramCustomEmojiPackSummary[];
  onSelect: (emoji: TelegramCustomEmoji) => void;
  onSelectStandard: (emoji: string) => void;
  onManage?: () => void;
  onPremiumTabOpen?: () => void;
  premiumLoading?: boolean;
  premiumError?: boolean;
  onRetryPremium?: () => void;
};

export function TelegramCustomEmojiPickerModal({
  open,
  onClose,
  packs,
  onSelect,
  onSelectStandard,
  onManage,
  onPremiumTabOpen,
  premiumLoading = false,
  premiumError = false,
  onRetryPremium,
}: Props) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"STANDARD" | "PREMIUM">("STANDARD");
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const standard = useMemo(
    () =>
      emojiIcons
        .filter(
          (item) =>
            !query ||
            item.name.toLowerCase().includes(query) ||
            item.emoji.includes(query),
        )
        .slice(0, 160),
    [query],
  );
  const matchingPacks = packs
    .map((pack) => ({
      pack,
      emojis: pack.emojis.filter(
        (emoji) => !query || emoji.alt.toLowerCase().includes(query),
      ),
    }))
    .filter(({ emojis }) => emojis.length);
  const selectTab = (nextTab: "STANDARD" | "PREMIUM") => {
    setTab(nextTab);
    if (nextTab === "PREMIUM") onPremiumTabOpen?.();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("telegram.posts.editorComponents.emojiPicker.title")}
      size="xs"
    >
      <div className="space-y-2">
        <div className="flex gap-1 border-b border-neutral-800">
          {(["STANDARD", "PREMIUM"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={tab === value}
              onClick={() => selectTab(value)}
              className={`px-2 pb-2 text-sm ${tab === value ? "border-b-2 border-blue-500 text-white" : "text-neutral-400"}`}
            >
              {t(
                value === "STANDARD"
                  ? "telegram.posts.editorComponents.emojiPicker.standard"
                  : "telegram.posts.editorComponents.emojiPicker.premium",
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t(
              "telegram.posts.editorComponents.emojiPicker.search",
            )}
            className="h-9"
          />
          {tab === "PREMIUM" && onManage ? (
            <Button
              type="button"
              variant="secondary"
              className="h-9 shrink-0 px-2"
              onClick={() => {
                onClose();
                onManage();
              }}
              aria-label={t(
                "telegram.posts.editorComponents.emojiPicker.managePremium",
              )}
              title={t(
                "telegram.posts.editorComponents.emojiPicker.managePremium",
              )}
            >
              <Settings2 size={15} />
            </Button>
          ) : null}
        </div>
        <div className="h-64 overflow-y-auto pr-1">
          {tab === "STANDARD" ? (
            <div className="grid grid-cols-8 gap-1">
              {standard.map((item) => (
                <button
                  key={`${item.emoji}-${item.name}`}
                  type="button"
                  aria-label={t(
                    "telegram.posts.editorComponents.emojiPicker.insert",
                  )}
                  title={item.name}
                  onClick={() => onSelectStandard(item.emoji)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-lg hover:bg-neutral-800"
                >
                  {item.emoji}
                </button>
              ))}
            </div>
          ) : premiumLoading ? (
            <p className="py-8 text-center text-sm text-neutral-500">
              {t("telegram.posts.editorComponents.emojiPicker.loadingPremium")}
            </p>
          ) : premiumError ? (
            <div className="flex flex-col items-center gap-2 py-8 text-sm text-rose-300">
              <p>
                {t("telegram.posts.editorComponents.emojiPicker.loadError")}
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={onRetryPremium}
              >
                {t("telegram.posts.editorComponents.emojiPicker.retry")}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {matchingPacks.map(({ pack, emojis }) => (
                <section key={pack.id}>
                  <p className="mb-1 truncate text-xs font-medium text-neutral-400">
                    {pack.title}
                  </p>
                  <div className="grid grid-cols-8 gap-1">
                    {emojis.map((emoji) => (
                      <button
                        key={emoji.documentId}
                        type="button"
                        aria-label={t(
                          "telegram.posts.editorComponents.emojiPicker.insertNamed",
                          {
                            name:
                              emoji.alt ||
                              t(
                                "telegram.posts.editorComponents.customEmoji.label",
                              ),
                          },
                        )}
                        title={emoji.alt}
                        onClick={() => onSelect(emoji)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-neutral-800"
                      >
                        <TelegramCustomEmojiRenderer emoji={emoji} />
                      </button>
                    ))}
                  </div>
                </section>
              ))}
              {!matchingPacks.length ? (
                <p className="py-8 text-center text-sm text-neutral-500">
                  {t(
                    "telegram.posts.editorComponents.emojiPicker.emptyPremium",
                  )}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

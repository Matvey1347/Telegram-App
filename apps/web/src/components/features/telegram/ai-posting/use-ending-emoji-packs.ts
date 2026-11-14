import { useEffect, useMemo, useState } from "react";
import type { TelegramCustomEmojiPackSummary } from "@telegram-system/shared";
import { telegramChannelsApi } from "@/lib/api";

/** Resolve only missing saved emoji, once per distinct ending and loaded pack list. */
export function useEndingEmojiPacks(
  ending: string,
  packs: TelegramCustomEmojiPackSummary[] | undefined,
) {
  const [resolved, setResolved] = useState<TelegramCustomEmojiPackSummary[]>(
    [],
  );
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const missingKey = useMemo(() => {
    if (!packs) return "";
    const known = new Set(
      packs.flatMap((pack) => pack.emojis.map((emoji) => emoji.documentId)),
    );
    return [
      ...new Set(
        [...ending.matchAll(/tg:\/\/emoji\?id=(\d{1,20})/g)].map(
          (match) => match[1],
        ),
      ),
    ]
      .filter((id) => !known.has(id))
      .slice(0, 100)
      .join(",");
  }, [ending, packs]);

  useEffect(() => {
    if (!missingKey) return;
    const controller = new AbortController();
    void telegramChannelsApi
      .resolveCustomEmojiDocuments(
        missingKey.split(","),
        () => {},
        controller.signal,
      )
      .then((result) => {
        if (controller.signal.aborted) return;
        setResolved(result.packs);
        const found = new Set(
          result.packs.flatMap((pack) =>
            pack.emojis.map((emoji) => emoji.documentId),
          ),
        );
        setFailed(missingKey.split(",").some((id) => !found.has(id)));
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [missingKey, attempt]);

  const combined = useMemo(
    () => [...(packs ?? []), ...resolved],
    [packs, resolved],
  );
  return {
    packs: combined,
    failed,
    retry: () => {
      setFailed(false);
      setAttempt((value) => value + 1);
    },
  };
}

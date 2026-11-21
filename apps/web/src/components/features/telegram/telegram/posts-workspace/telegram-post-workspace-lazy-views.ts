"use client";

import dynamic from "next/dynamic";

export const TelegramPostPreview = dynamic(() =>
  import("@/components/features/telegram/telegram/telegram-post-preview").then(
    (module) => module.TelegramPostPreview,
  ),
);

export const TelegramCustomEmojiPacksModal = dynamic(() =>
  import("@/components/features/telegram/telegram/telegram-custom-emoji-packs-modal").then(
    (module) => module.TelegramCustomEmojiPacksModal,
  ),
);

export const AiPostingPage = dynamic(() =>
  import("@/components/features/telegram/ai-posting/ai-posting-page").then(
    (module) => module.AiPostingPage,
  ),
);

export const ManagedPostHistoryModal = dynamic(() =>
  import("@/components/features/telegram/telegram/managed-post-history-modal").then(
    (module) => module.ManagedPostHistoryModal,
  ),
);

export const ContentHypothesesWorkspace = dynamic(() =>
  import("@/components/features/telegram/telegram/content-hypotheses-modal").then(
    (module) => module.ContentHypothesesWorkspace,
  ),
);

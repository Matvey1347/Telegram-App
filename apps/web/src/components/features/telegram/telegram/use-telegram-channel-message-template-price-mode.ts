"use client";

import { useMemo, useState } from "react";
import {
  buildTelegramChannelMessageTemplate,
  readTelegramChannelMessageTemplatePriceMode,
  rewriteTelegramChannelMessageTemplatePriceMode,
  type TelegramChannelMessageTemplateLayout,
} from "./telegram-channel-message-template-format";

export function useTelegramChannelMessageTemplatePriceMode(
  initialBody: string,
  layout: TelegramChannelMessageTemplateLayout,
) {
  const [priceMode, setPriceMode] = useState(() =>
    readTelegramChannelMessageTemplatePriceMode(initialBody),
  );
  const bodyTemplate = useMemo(
    () =>
      rewriteTelegramChannelMessageTemplatePriceMode(
        buildTelegramChannelMessageTemplate(layout),
        priceMode,
      ),
    [layout, priceMode],
  );
  return { bodyTemplate, priceMode, setPriceMode };
}

"use client";

import { useParams } from "next/navigation";
import { TelegramChannelAnalyticsScreen } from "@/components/features/telegram/telegram/channel-analytics/channel-analytics-screen";

export default function TelegramChannelAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  return <TelegramChannelAnalyticsScreen id={id} />;
}

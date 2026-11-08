import type { Metadata } from "next";
import { AiPostingPage } from "@/components/features/telegram/ai-posting/ai-posting-page";
export const metadata: Metadata = { title: "AI Posting · Nexeloq" };
export default function AiPostingRoute() {
  return <AiPostingPage />;
}

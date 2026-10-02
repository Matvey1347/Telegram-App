import type { Metadata } from "next";
import { PublicationPlanCalendarPage } from "@/components/features/telegram/publication-plan-calendar/publication-plan-calendar-page";

export const metadata: Metadata = {
  title: "🗓️ Publication calendar · Nexeloq",
};

export default function PublicationCalendarRoute() {
  return <PublicationPlanCalendarPage />;
}

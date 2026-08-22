import type { Metadata } from "next";
import { ConsumerFinanceProvider } from "@/providers/consumer-finance-provider";

export const metadata: Metadata = {
  title: "Finance",
  description: "Personal finance tracking in your browser and Telegram.",
  icons: {
    icon: "/brand/favicon-finance.png",
    shortcut: "/brand/favicon-finance.png",
    apple: "/brand/finance.png",
  },
};

export default function ConsumerFinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConsumerFinanceProvider>{children}</ConsumerFinanceProvider>;
}

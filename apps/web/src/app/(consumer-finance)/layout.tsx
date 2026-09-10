import type { Metadata } from "next";
import { ConsumerFinanceProvider } from "@/providers/consumer-finance-provider";

export const metadata: Metadata = {
  title: "Finance",
  description: "Track income, expenses, accounts, and plans in Finance.",
  icons: {
    icon: "/brand/favicon-finance.png",
    shortcut: "/brand/favicon-finance.png",
    apple: "/brand/finance-apple-touch.png",
  },
};

export default function ConsumerFinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConsumerFinanceProvider>{children}</ConsumerFinanceProvider>;
}

import type { Metadata } from "next";
import { ConsumerFinanceProvider } from "@consumer-finance/web/provider/consumer-finance-provider";

export const metadata: Metadata = {
  title: "Groshly",
  description: "Track income, expenses, accounts, and plans in Finance.",
  icons: {
    icon: "/brand/groshly-icon.png",
    shortcut: "/brand/groshly-icon.png",
    apple: "/brand/groshly-icon.png",
  },
};

export default function ConsumerFinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ConsumerFinanceProvider>{children}</ConsumerFinanceProvider>;
}

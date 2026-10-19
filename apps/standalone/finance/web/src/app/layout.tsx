import type { Metadata, Viewport } from "next";
import { TelegramWebAppSdk } from "@finance-web/components/telegram/telegram-web-app-sdk";
import { ConsumerFinanceProvider } from "@consumer-finance/web/provider/consumer-finance-provider";
import "../groshly/style.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Groshly",
  description: "Track income, expenses, accounts, and plans in Groshly.",
  applicationName: "Groshly",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/brand/favicon-finance.png",
    shortcut: "/brand/favicon-finance.png",
    apple: "/brand/finance-apple-touch.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f8f4",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <TelegramWebAppSdk />
      </head>
      <body>
        <ConsumerFinanceProvider>{children}</ConsumerFinanceProvider>
      </body>
    </html>
  );
}

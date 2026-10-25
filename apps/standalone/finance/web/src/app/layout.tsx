import type { Metadata, Viewport } from "next";
import { TelegramWebAppSdk } from "@finance-web/components/telegram/telegram-web-app-sdk";
import { ConsumerFinanceProvider } from "@consumer-finance/web/provider/consumer-finance-provider";
import "../groshly/style.css";
import "./globals.css";

// A neutral initial icon prevents the old bundled artwork from appearing while
// the active bot is being resolved on the root route.
const initialFavicon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'/%3E";

const restoreBotFavicon = `try {
  const pathBotId = location.pathname.match(/^\\/finance\\/([^/]+)/)?.[1];
  const botId = pathBotId ? decodeURIComponent(pathBotId) : localStorage.getItem('finance-active-bot-id')?.trim();
  if (botId) {
    const href = '/api/finance-bots/' + encodeURIComponent(botId) + '/branding/favicon';
    const icons = document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]');
    if (icons.length) {
      for (const link of icons) link.href = href;
    } else {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = href;
      document.head.appendChild(link);
    }
    let manifest = document.querySelector('link[rel="manifest"]');
    if (!manifest) {
      manifest = document.createElement('link');
      manifest.rel = 'manifest';
      document.head.appendChild(manifest);
    }
    manifest.href = '/finance/' + encodeURIComponent(botId) + '/manifest.webmanifest';
  }
} catch { /* Storage can be unavailable in private browsing. */ }`;

export const metadata: Metadata = {
  title: "Groshly",
  description: "Track income, expenses, accounts, and plans in Groshly.",
  applicationName: "Groshly",
  icons: {
    icon: initialFavicon,
    shortcut: initialFavicon,
    apple: initialFavicon,
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
        <script dangerouslySetInnerHTML={{ __html: restoreBotFavicon }} />
      </head>
      <body>
        <ConsumerFinanceProvider>{children}</ConsumerFinanceProvider>
      </body>
    </html>
  );
}

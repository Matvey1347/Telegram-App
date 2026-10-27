import type { Metadata, Viewport } from "next";
import { TelegramWebAppSdk } from "@finance-web/components/telegram/telegram-web-app-sdk";
import { ConsumerFinanceProvider } from "@consumer-finance/web/provider/consumer-finance-provider";
import "../groshly/style.css";
import "./globals.css";
import "./legal.css";
import "@consumer-finance/web/components/app/consumer-finance-landing-base.css";
import "@consumer-finance/web/components/app/consumer-finance-landing-sections.css";
import "@consumer-finance/web/components/app/consumer-finance-landing-motion.css";
import "@consumer-finance/web/components/app/consumer-finance-landing-updates.css";

const initialFavicon = process.env.NODE_ENV === "development" ? "/brand/groshly-dev-icon.png" : "/brand/groshly-icon.png";

const restoreBotFavicon = `try {
  const pathBotId = location.pathname.match(/^\\/finance\\/([^/]+)/)?.[1];
  const botId = pathBotId ? decodeURIComponent(pathBotId) : null;
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
  title: "Groshly — особисті фінанси в Telegram і браузері",
  description:
    "Контролюйте рахунки, витрати, борги й аналітику в Groshly. Увійдіть або зареєструйтеся через Telegram.",
  applicationName: "Groshly",
  openGraph: {
    title: "Groshly — ваші гроші зрозуміло",
    description:
      "Рахунки, витрати, борги й аналітика в одному місці. Вхід через Telegram.",
    type: "website",
  },
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
    <html lang="uk">
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

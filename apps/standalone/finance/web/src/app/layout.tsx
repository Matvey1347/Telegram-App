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
      </head>
      <body>
        <ConsumerFinanceProvider>{children}</ConsumerFinanceProvider>
      </body>
    </html>
  );
}

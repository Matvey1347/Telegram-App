import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { TelegramWebAppSdk } from '@/components/telegram/telegram-web-app-sdk';
import { APP_LOCALE_COOKIE, normalizeAppLocale } from '@/i18n/types';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nexeloq',
  description: 'Internal system for Telegram finance, ads and analytics',
  icons: {
    icon: '/brand/favicon-prod.png',
    shortcut: '/brand/favicon-prod.png',
    apple: '/brand/telegram-system.png',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = normalizeAppLocale((await cookies()).get(APP_LOCALE_COOKIE)?.value);
  return (
    <html lang={locale}>
      <head>
        <TelegramWebAppSdk />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}

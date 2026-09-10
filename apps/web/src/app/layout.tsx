import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { TelegramWebAppSdk } from '@/components/telegram/telegram-web-app-sdk';
import { APP_LOCALE_COOKIE, normalizeAppLocale } from '@/i18n/types';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nexeloq',
  description: 'Internal system for Telegram finance, ads and analytics',
  applicationName: 'Nexeloq',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Nexeloq',
  },
  icons: {
    icon: '/brand/favicon-prod.png',
    shortcut: '/brand/favicon-prod.png',
    apple: '/brand/nexeloq-apple-touch.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  viewportFit: 'cover',
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

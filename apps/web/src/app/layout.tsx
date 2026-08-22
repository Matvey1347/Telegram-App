import type { Metadata } from 'next';
import { TelegramWebAppSdk } from '@/components/telegram/telegram-web-app-sdk';
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <TelegramWebAppSdk />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}

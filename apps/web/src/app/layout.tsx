import type { Metadata } from 'next';
import { TelegramWebAppSdk } from '@/components/telegram/telegram-web-app-sdk';
import './globals.css';

export const metadata: Metadata = {
  title: 'Telegram System',
  description: 'Internal system for Telegram finance, ads and analytics',
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

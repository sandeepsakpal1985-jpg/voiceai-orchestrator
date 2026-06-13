export const dynamic = 'force-dynamic';

export const runtime = 'nodejs';

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import ClientToaster from './ClientToaster';
import SentryInit from './SentryInit';
import PostHogInit from './PostHogInit';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'MetaPilot AI — AI Social Sales Agent',
  description: 'Hire an AI sales employee in 5 minutes. Automate Instagram & Facebook sales and support.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <SentryInit />
        <PostHogInit />
        {children}
        <ClientToaster />
      </body>
    </html>
  );
}

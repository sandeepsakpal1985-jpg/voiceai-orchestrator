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
  title: 'KluConnect — Turn Every Comment Into A Customer',
  description: 'Your AI social sales employee. Auto-reply to Instagram comments and Facebook DMs, capture leads, and close sales.',
  icons: { icon: '/branding/favicon.svg' },
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

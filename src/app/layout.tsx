import type { Metadata, Viewport } from 'next';
import './globals.css';
import BottomNav from '@/components/BottomNav';
import DebugOverlay from '@/components/DebugOverlay';
import { Analytics } from '@vercel/analytics/next';

export const metadata: Metadata = {
  title: 'Musteleads',
  description: 'Scan badges and business cards to capture leads.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Musteleads',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#000000',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="icon" type="image/svg+xml" href="/icons/favicon.svg" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="min-h-screen bg-black text-white antialiased">
        {/* Main content with bottom padding for the nav bar. */}
        <main className="pb-20">{children}</main>
        <BottomNav />
        <DebugOverlay />
        <Analytics />
      </body>
    </html>
  );
}

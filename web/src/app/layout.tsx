import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Providers } from '@/components/providers';
import { APP_TITLE } from '@/lib/page-titles';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: {
    default: APP_TITLE,
    template: `%s - ${APP_TITLE}`,
  },
  description:
    'The AI-powered Discord bot for modern communities. Moderation, AI chat, dynamic welcomes, spam detection, and a fully configurable web dashboard.',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/icon.png', type: 'image/png', sizes: '128x128' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

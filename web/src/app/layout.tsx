import type { Metadata } from 'next';
import { JetBrains_Mono, Manrope } from 'next/font/google';
import { Providers } from '@/components/providers';
import { APP_TITLE } from '@/lib/page-titles';
import './globals.css';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: {
    default: APP_TITLE,
    template: `%s - ${APP_TITLE}`,
  },
  description:
    'The AI-powered Discord bot for modern communities. Moderation, AI chat, dynamic welcomes, spam detection, and a fully configurable web dashboard.',
  metadataBase: new URL('https://volvox.bot'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://volvox.bot',
    siteName: 'Volvox.Bot',
    title: 'Volvox.Bot — AI-Powered Discord Bot',
    description:
      'The AI-powered Discord bot for modern communities. Moderation, AI chat, dynamic welcomes, spam detection, and a fully configurable web dashboard.',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Volvox.Bot — AI-Powered Discord Bot',
    description:
      'The AI-powered Discord bot for modern communities. Moderation, AI chat, dynamic welcomes, spam detection, and a fully configurable web dashboard.',
    images: ['/opengraph-image'],
  },
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
    <html lang="en" suppressHydrationWarning>
      <body
        className={`font-sans ${manrope.variable} ${jetbrainsMono.variable}`}
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

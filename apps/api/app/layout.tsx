import type { Metadata } from 'next';
import { Big_Shoulders, Source_Sans_3, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const bigShoulders = Big_Shoulders({
  subsets: ['latin'],
  variable: '--font-big-shoulders',
  weight: ['400', '500', '600', '700', '800', '900'],
  adjustFontFallback: false,
});

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-source-sans',
  weight: ['400', '500', '600'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'Parley — Adversarial Code Review',
  description: 'A live, multi-agent code review powered by Temporal workflows',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${bigShoulders.variable} ${sourceSans.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen bg-surface-0 text-text-primary antialiased" style={{ fontFamily: 'var(--font-body)' }}>
        {children}
      </body>
    </html>
  );
}

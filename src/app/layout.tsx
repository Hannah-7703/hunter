import type { Metadata } from "next";
import localFont from 'next/font/local';
import { Noto_Sans_SC } from 'next/font/google';
import Toast from '@/components/ui/Toast';
import DataPreloader from '@/components/ui/DataPreloader';
import AuthGate from '@/components/ui/AuthGate';
import '@/styles/globals.css';
import '@/styles/components.css';

const dmSerif = localFont({
  src: '../../public/fonts/DM-Serif-Display-Regular.woff2',
  variable: '--font-heading',
  fallback: ['Georgia', 'serif'],
  adjustFontFallback: false,
});

const inter = localFont({
  src: [
    { path: '../../public/fonts/Inter-Regular.woff2', weight: '400' },
    { path: '../../public/fonts/Inter-Medium.woff2', weight: '500' },
  ],
  variable: '--font-body',
});

const notoSansSC = Noto_Sans_SC({
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-cjk',
  preload: true,
});

export const metadata: Metadata = {
  title: "Aha Hunter",
  description: "捕捉灵感，沉淀思考",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${dmSerif.variable} ${inter.variable} ${notoSansSC.variable}`}>
      <body className="font-body"><AuthGate><DataPreloader />{children}</AuthGate><Toast /></body>
    </html>
  );
}

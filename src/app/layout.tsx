import type { Metadata } from "next";
import localFont from 'next/font/local';
import Toast from '@/components/ui/Toast';
import DataPreloader from '@/components/ui/DataPreloader';
import AuthGate from '@/components/ui/AuthGate';
import FeedbackButton from '@/components/ui/FeedbackButton';
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

const notoSansSC = localFont({
  src: [
    { path: '../../public/fonts/NotoSansCJKsc-Regular.otf', weight: '400' },
    { path: '../../public/fonts/NotoSansCJKsc-Medium.otf', weight: '500' },
  ],
  display: 'swap',
  variable: '--font-cjk',
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
      <body className="font-body"><AuthGate><DataPreloader />{children}<FeedbackButton /></AuthGate><Toast /></body>
    </html>
  );
}

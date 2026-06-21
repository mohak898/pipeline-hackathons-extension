import { Inter } from 'next/font/google';
import './globals.css';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata = {
  title: 'Hackathon Pipeline Tracker',
  description: 'Track hackathon deadlines and share timelines with your team.',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#020202',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}

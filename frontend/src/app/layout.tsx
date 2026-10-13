import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Navbar } from '@/components/Navbar';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: "Meme'd Payout Tracker",
  description: 'Brands run milestone-based campaigns; creators submit posts and track earnings.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-screen font-sans antialiased">
        <Providers>
          <Navbar />
          <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}

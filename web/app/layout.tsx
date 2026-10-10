import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'PergiBerdua',
  description: 'Simpan wishlist, rencanakan perjalanan, dan pergi berdua.',
  robots: {index: false, follow: false}
};
// Nonce CSP needs request-time rendering, not statically cached HTML.
export const dynamic = 'force-dynamic';
export default function RootLayout({children}: {children: ReactNode}) {
  return <html lang="id"><body>{children}</body></html>;
}

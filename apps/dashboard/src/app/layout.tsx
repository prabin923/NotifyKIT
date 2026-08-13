import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'NotifyKit | Notification Operations', description: 'Universal Notification Platform dashboard' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }

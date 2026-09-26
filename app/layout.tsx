import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'

import { Providers } from '@/components/providers'

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'CrossCart — The quiet system behind fast businesses',
  description: 'The ultra-fast, free POS and inventory system for retail, restaurants, and cafes.',
}

const themeScript = `(function(){try{var t=localStorage.getItem('crosscart-theme');var isDark=t?t==='dark':true;var d=document.documentElement;d.classList.toggle('dark',isDark);d.classList.toggle('light',!isDark);d.style.colorScheme=isDark?'dark':'light';var l=localStorage.getItem('crosscart-lang');d.lang=l==='ID'?'id':'en';}catch(e){}})();`

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${dmSans.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

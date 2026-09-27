import type { Metadata } from 'next'
import { Inter, JetBrains_Mono, Source_Serif_4 } from 'next/font/google'
import './globals.css'

import { Providers } from '@/components/providers'

// The tweakcn "tangerine" type stack, self-hosted by next/font. The variables
// land on <html> so app/globals.css can map them to --font-sans/--font-serif/--font-mono.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const jetBrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono' })
const sourceSerif = Source_Serif_4({ subsets: ['latin'], variable: '--font-source-serif' })
const fontVariables = `${inter.variable} ${jetBrainsMono.variable} ${sourceSerif.variable}`

export const metadata: Metadata = {
  title: 'CrossCart — The quiet system behind fast businesses',
  description: 'The ultra-fast, free POS and inventory system for retail, restaurants, and cafes.',
}

const themeScript = `(function(){try{var t=localStorage.getItem('crosscart-theme');var isDark=t?t==='dark':true;var d=document.documentElement;d.classList.toggle('dark',isDark);d.classList.toggle('light',!isDark);d.style.colorScheme=isDark?'dark':'light';var l=localStorage.getItem('crosscart-lang');d.lang=l==='ID'?'id':'en';}catch(e){}})();`

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={fontVariables}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

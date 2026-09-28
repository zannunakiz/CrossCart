"use client"

import { SessionProvider } from "next-auth/react"
import { Toaster } from "sonner"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      {/* Bottom-right on desktop. Sonner's own `max-width: 600px` rules turn the
          toaster into a full-width strip pinned to the bottom edge, so on a
          phone the same setting already reads as bottom-centre. */}
      <Toaster richColors position="bottom-right" />
    </SessionProvider>
  )
}

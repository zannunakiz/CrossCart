"use client"

import * as React from "react"

interface SidebarContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

const SidebarContext = React.createContext<SidebarContextValue | undefined>(undefined)

export function MainSidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)

  const toggle = React.useCallback(() => {
    setOpen((prev) => !prev)
  }, [])

  return (
    <SidebarContext.Provider value={{ open, setOpen, toggle }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useMainSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useMainSidebar must be used within MainSidebarProvider")
  }
  return context
}

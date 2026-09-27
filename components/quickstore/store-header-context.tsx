"use client"

import * as React from "react"

import type { StoreRole } from "@/lib/db/schema"

/**
 * Data the QuickStore detail pages publish to the app navbar so the breadcrumb
 * (`quickstore › {store} {open/closed} {role}`) can be rendered there instead of
 * a per-page header. Works for both `/quickstore/[storeId]` and its child routes
 * such as `/quickstore/[storeId]/cashier`.
 */
export interface QuickStoreHeader {
  storeId: string
  name: string
  open: boolean
  role: StoreRole
}

interface QuickStoreHeaderContextValue {
  header: QuickStoreHeader | null
  setHeader: (header: QuickStoreHeader | null) => void
}

const QuickStoreHeaderContext =
  React.createContext<QuickStoreHeaderContextValue | undefined>(undefined)

export function QuickStoreHeaderProvider({ children }: { children: React.ReactNode }) {
  const [header, setHeader] = React.useState<QuickStoreHeader | null>(null)

  const value = React.useMemo(() => ({ header, setHeader }), [header])

  return (
    <QuickStoreHeaderContext.Provider value={value}>
      {children}
    </QuickStoreHeaderContext.Provider>
  )
}

export function useQuickStoreHeader() {
  const context = React.useContext(QuickStoreHeaderContext)
  if (!context) {
    throw new Error("useQuickStoreHeader must be used within QuickStoreHeaderProvider")
  }
  return context
}

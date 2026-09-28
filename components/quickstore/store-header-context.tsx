"use client"

import * as React from "react"

import type { StoreRole } from "@/lib/db/schema"
import type { StoreTab } from "@/lib/quickstore/store-tabs"

/**
 * Data the QuickStore detail pages publish to the app navbar so the breadcrumb
 * (`quickstore › {store}`) can be rendered there instead of a per-page header.
 * The open/closed state and role are shown in the page content instead — see
 * `StoreStatusLine`. Works for both `/quickstore/[storeId]` and its child routes
 * such as `/quickstore/[storeId]/cashier`.
 *
 * The sidebar drawer reads the same value, which is how it knows to show the
 * store block (name, status, role, the tab list and the cashier shortcut) only
 * while a store route is on screen.
 */
export interface QuickStoreHeader {
  storeId: string
  name: string
  open: boolean
  role: StoreRole
  /**
   * The tab currently open (`?tab=…`). `undefined` on child routes that have no
   * tab strip (e.g. the cashier), where the drawer lists the tabs without
   * highlighting one. Published by the page instead of the drawer reading
   * `useSearchParams`, because the shell layout sits above the Suspense boundary
   * that a search-param read would need.
   */
  tab?: StoreTab
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

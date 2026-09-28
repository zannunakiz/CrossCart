/**
 * Presentation metadata for the QuickStore detail tabs.
 *
 * Labels and icons are shared by the page's tab strip and by the app shell's
 * sidebar drawer, so a tab can never read "Items" in one place and something
 * else in the other. Only the label KEY lives here — the visible text comes from
 * `t()` in the component, which is what keeps the tab list bilingual.
 */

import { History, Package, Store as StoreIcon, Users } from "lucide-react"

import type { TranslationKey } from "@/lib/i18n"
import type { StoreTab } from "@/lib/quickstore/store-tabs"

export interface StoreTabUi {
  /** Translation key of the visible tab label. */
  titleKey: TranslationKey
  icon: React.ComponentType<{ className?: string }>
}

export const STORE_TAB_UI: Record<StoreTab, StoreTabUi> = {
  store: { titleKey: "Store", icon: StoreIcon },
  items: { titleKey: "Items", icon: Package },
  history: { titleKey: "History", icon: History },
  members: { titleKey: "Members", icon: Users },
}

// Tiny client-side translation store for the app shell (EN / ID).
// It reuses the same localStorage store as the theme so both preferences live
// in one place and stay reactive through useSyncExternalStore (see lib/preferences.ts).

import { useCallback, useSyncExternalStore } from 'react'

import {
  getLanguageSnapshot,
  getServerLanguageSnapshot,
  subscribePreferences,
  type Language,
} from '@/lib/preferences'

export type { Language }

const en = {
  // ── Shell: sidebar / navbar ───────────────────────────────────────────────
  'brand.adminConsole': 'Admin Console',
  'nav.group.apps': 'Apps',
  'nav.dashboard': 'Dashboard',
  'nav.pos': 'POS System',
  'nav.quickstore': 'Quick Store',
  'nav.signOut': 'Sign out',
  'nav.toggleSidebar': 'Toggle navigation sidebar',
  'nav.toggleTheme': 'Toggle color theme',
  'nav.toggleLanguage': 'Toggle language EN/ID',
  'nav.closeSidebar': 'Close sidebar',
  'nav.sidebarNav': 'Sidebar navigation',
  'nav.badge.live': 'Live',
  'nav.theme.dark': 'Dark',
  'nav.theme.light': 'Light',

  // ── Shared ────────────────────────────────────────────────────────────────
  'common.backToOverview': 'Back to Overview',
  'common.moduleReady': 'This module is configured and ready for implementation.',
  'common.mockupActive': 'Feature mockup active in sidebar navigation.',

  // ── Dashboard ─────────────────────────────────────────────────────────────
  'dash.title': 'Overview Dashboard',
  'dash.subtitle': 'Live overview of store sales, orders, and kitchen operations.',
  'dash.app.pos.title': 'POS System',
  'dash.app.pos.subtitle': 'Point-of-sale cashier for in-store orders',
  'dash.app.quickstore.title': 'Quick Store',
  'dash.app.quickstore.subtitle': 'Manage your online micro-store & inventory',
  'dash.badge.live': 'Live',
  'dash.stats.grossSales': "Today's Gross Sales",
  'dash.stats.grossSalesChange': '+12.5% vs yesterday',
  'dash.stats.activeOrders': 'Active Orders',
  'dash.stats.activeOrdersValue': '18 Orders',
  'dash.stats.activeOrdersChange': '4 waiting in kitchen',
  'dash.stats.lowStock': 'Low Stock Items',
  'dash.stats.lowStockValue': '3 items',
  'dash.stats.lowStockChange': 'Oat Milk, Vanilla, Cups',
  'dash.stats.staff': 'Staff on Duty',
  'dash.stats.staffValue': '5 Members',
  'dash.stats.staffChange': 'Shift ends 16:00',
  'dash.recentOrders': 'Recent Store Orders',
  'dash.recentOrdersSub': 'Real-time receipts from tables & counter',
  'dash.viewAll': 'View all',
  'dash.col.orderId': 'Order ID',
  'dash.col.type': 'Type',
  'dash.col.items': 'Items',
  'dash.col.total': 'Total',
  'dash.col.status': 'Status',
  'dash.status.preparing': 'Preparing',
  'dash.status.ready': 'Ready',
  'dash.status.completed': 'Completed',
  'dash.shortcuts': 'Quick Shortcuts',
  'dash.shortcutsSub': 'Fast navigation',

  // ── POS ───────────────────────────────────────────────────────────────────
  'pos.title': 'POS System',
  'pos.description': 'Point-of-sale cashier interface for fast in-store checkout.',

  // ── Quick Store list ──────────────────────────────────────────────────────
  'qs.title': 'Quick Store',
  'qs.subtitle': 'Manage your micro-stores — items, members, and payments.',
  'qs.newStore': 'New Store',
  'qs.empty.title': 'No stores yet',
  'qs.empty.subtitle': 'Create your first store to start selling.',
  'qs.empty.cta': 'Create Store',
  'qs.open': 'Open',
  'qs.closed': 'Closed',
  'qs.openLink': 'Open →',
  'qs.loadFailed': 'Failed to load stores',
  'qs.created': 'Store "{name}" created!',
} as const

export type TranslationKey = keyof typeof en

// Indonesian dictionary — must cover every EN key (enforced by the type below).
const id: Record<TranslationKey, string> = {
  // ── Shell: sidebar / navbar ───────────────────────────────────────────────
  'brand.adminConsole': 'Konsol Admin',
  'nav.group.apps': 'Aplikasi',
  'nav.dashboard': 'Dasbor',
  'nav.pos': 'Sistem POS',
  'nav.quickstore': 'Quick Store',
  'nav.signOut': 'Keluar',
  'nav.toggleSidebar': 'Buka atau tutup navigasi samping',
  'nav.toggleTheme': 'Ganti tema warna',
  'nav.toggleLanguage': 'Ganti bahasa EN/ID',
  'nav.closeSidebar': 'Tutup sidebar',
  'nav.sidebarNav': 'Navigasi sidebar',
  'nav.badge.live': 'Aktif',
  'nav.theme.dark': 'Gelap',
  'nav.theme.light': 'Terang',

  // ── Shared ────────────────────────────────────────────────────────────────
  'common.backToOverview': 'Kembali ke Ikhtisar',
  'common.moduleReady': 'Modul ini sudah siap untuk diimplementasikan.',
  'common.mockupActive': 'Mockup fitur aktif pada navigasi sidebar.',

  // ── Dashboard ─────────────────────────────────────────────────────────────
  'dash.title': 'Dasbor Ikhtisar',
  'dash.subtitle': 'Pantau penjualan, pesanan, dan operasional dapur secara langsung.',
  'dash.app.pos.title': 'Sistem POS',
  'dash.app.pos.subtitle': 'Kasir point-of-sale untuk pesanan di toko',
  'dash.app.quickstore.title': 'Quick Store',
  'dash.app.quickstore.subtitle': 'Kelola toko online mikro & stok Anda',
  'dash.badge.live': 'Aktif',
  'dash.stats.grossSales': 'Penjualan Bruto Hari Ini',
  'dash.stats.grossSalesChange': '+12,5% dibanding kemarin',
  'dash.stats.activeOrders': 'Pesanan Aktif',
  'dash.stats.activeOrdersValue': '18 Pesanan',
  'dash.stats.activeOrdersChange': '4 menunggu di dapur',
  'dash.stats.lowStock': 'Item Stok Menipis',
  'dash.stats.lowStockValue': '3 item',
  'dash.stats.lowStockChange': 'Susu Oat, Vanila, Gelas',
  'dash.stats.staff': 'Staf Bertugas',
  'dash.stats.staffValue': '5 Anggota',
  'dash.stats.staffChange': 'Shift berakhir 16:00',
  'dash.recentOrders': 'Pesanan Toko Terbaru',
  'dash.recentOrdersSub': 'Struk real-time dari meja & kasir',
  'dash.viewAll': 'Lihat semua',
  'dash.col.orderId': 'ID Pesanan',
  'dash.col.type': 'Tipe',
  'dash.col.items': 'Item',
  'dash.col.total': 'Total',
  'dash.col.status': 'Status',
  'dash.status.preparing': 'Diproses',
  'dash.status.ready': 'Siap',
  'dash.status.completed': 'Selesai',
  'dash.shortcuts': 'Pintasan Cepat',
  'dash.shortcutsSub': 'Navigasi cepat',

  // ── POS ───────────────────────────────────────────────────────────────────
  'pos.title': 'Sistem POS',
  'pos.description': 'Antarmuka kasir point-of-sale untuk pembayaran cepat di toko.',

  // ── Quick Store list ──────────────────────────────────────────────────────
  'qs.title': 'Quick Store',
  'qs.subtitle': 'Kelola toko mikro Anda — item, anggota, dan pembayaran.',
  'qs.newStore': 'Toko Baru',
  'qs.empty.title': 'Belum ada toko',
  'qs.empty.subtitle': 'Buat toko pertama Anda untuk mulai berjualan.',
  'qs.empty.cta': 'Buat Toko',
  'qs.open': 'Buka',
  'qs.closed': 'Tutup',
  'qs.openLink': 'Buka →',
  'qs.loadFailed': 'Gagal memuat daftar toko',
  'qs.created': 'Toko "{name}" berhasil dibuat!',
}

export const translations: Record<Language, Record<TranslationKey, string>> = {
  EN: en,
  ID: id,
}

export function translate(
  lang: Language,
  key: TranslationKey,
  vars?: Record<string, string | number>
) {
  let text: string = translations[lang][key] ?? translations.EN[key] ?? key

  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value))
    }
  }

  return text
}

/** Current language, reactive to the language toggle. */
export function useLanguage(): Language {
  return useSyncExternalStore(
    subscribePreferences,
    getLanguageSnapshot,
    getServerLanguageSnapshot
  )
}

/** Translation helper: `const { lang, t } = useTranslation()`. */
export function useTranslation() {
  const lang = useLanguage()

  // t is memoized per language so it can safely be used in effect deps.
  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) =>
      translate(lang, key, vars),
    [lang]
  )

  return { lang, t }
}


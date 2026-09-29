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
import type { AvailabilityCode, CheckoutErrorCode } from '@/lib/quickstore/cashier'

export type { Language }

const en = {
  // ── Shell: sidebar / navbar ───────────────────────────────────────────────
  'brand.adminConsole': 'Admin Console',
  'nav.group.apps': 'Apps',
  'nav.dashboard': 'Dashboard',
  'nav.quickstore': 'Quick Store',
  'nav.signOut': 'Sign out',
  'nav.toggleSidebar': 'Toggle navigation sidebar',
  'nav.toggleTheme': 'Toggle color theme',
  'nav.toggleLanguage': 'Toggle language EN/ID',
  'nav.closeSidebar': 'Close sidebar',
  'nav.sidebarNav': 'Sidebar navigation',
  'nav.theme.dark': 'Dark',
  'nav.theme.light': 'Light',
  // Store block the sidebar adds while a `/quickstore/[storeId]` route is open.
  'nav.group.store': 'Store',
  'nav.group.storeTabs': 'Tabs',
  'nav.openCashierNewTab': 'Open the cashier in a new tab',

  // ── Dashboard ─────────────────────────────────────────────────────────────
  'dash.title': 'Overview Dashboard',
  'dash.subtitle': 'Everything your micro-stores need — items, sales, and teammates.',
  'dash.app.quickstore.title': 'Quick Store',
  'dash.app.quickstore.subtitle': 'Manage your online micro-store & inventory',
  'dash.app.pos.title': 'Modern POS',
  'dash.app.pos.subtitle': 'Restaurant-grade register & kitchen display — on the way',
  'dash.badge.comingSoon': 'Coming soon',

  // ── Modern POS (parked route — coming soon) ───────────────────────────────
  'posSoon.badge': 'Coming soon',
  'posSoon.back': 'Back to dashboard',

  // ── Quick Store list ──────────────────────────────────────────────────────
  'qs.title': 'Quick Store',
  'qs.subtitle': 'Manage your micro-stores — items, members, and payments.',
  'qs.newStore': 'New Store',
  'qs.empty.title': 'No stores yet',
  'qs.empty.subtitle': 'Create your first store to start selling.',
  'qs.empty.cta': 'Create Store',
  'qs.open': 'Open',
  'qs.closed': 'Closed',
  'qs.openLink': 'Enter →',
  'qs.loadFailed': 'Failed to load stores',
  'qs.created': 'Store "{name}" created!',

  // ── 404 / Not found ───────────────────────────────────────────────────────
  // Rendered by app/not-found.tsx: for unmatched URLs, including the
  // `/not-found` path that store pages redirect to when a store id is unknown
  // (or malformed, i.e. not a UUID).
  'nf.badge': 'Error 404',
  'nf.title': 'Page not found',
  'nf.body': 'The page you are looking for is unavailable.',
  'nf.back': 'Back to home',
  'nf.redirecting': 'Redirecting to home in {seconds} seconds',
  'nf.redirectingOne': 'Redirecting to home in 1 second',
  'nf.redirectingNow': 'Redirecting now…',
} as const

export type TranslationKey = keyof typeof en | PhraseKey

// Indonesian dictionary — must cover every dotted EN key (enforced by the type).
const id: Record<keyof typeof en, string> = {
  // ── Shell: sidebar / navbar ───────────────────────────────────────────────
  'brand.adminConsole': 'Konsol Admin',
  'nav.group.apps': 'Aplikasi',
  'nav.dashboard': 'Dasbor',
  'nav.quickstore': 'Quick Store',
  'nav.signOut': 'Keluar',
  'nav.toggleSidebar': 'Buka atau tutup navigasi samping',
  'nav.toggleTheme': 'Ganti tema warna',
  'nav.toggleLanguage': 'Ganti bahasa EN/ID',
  'nav.closeSidebar': 'Tutup sidebar',
  'nav.sidebarNav': 'Navigasi sidebar',
  'nav.theme.dark': 'Gelap',
  'nav.theme.light': 'Terang',
  'nav.group.store': 'Toko',
  'nav.group.storeTabs': 'Tab',
  'nav.openCashierNewTab': 'Buka kasir di tab baru',

  // ── Dashboard ─────────────────────────────────────────────────────────────
  'dash.title': 'Dasbor',
  'dash.subtitle': 'Semua yang toko mikro Anda butuhkan — item, penjualan, dan tim.',
  'dash.app.quickstore.title': 'Quick Store',
  'dash.app.quickstore.subtitle': 'Kelola toko mikro & stok Anda',
  'dash.app.pos.title': 'Modern POS',
  'dash.app.pos.subtitle': 'Kasir & display dapur kelas restoran — segera hadir',
  'dash.badge.comingSoon': 'Segera hadir',

  // ── Modern POS (parked route — coming soon) ───────────────────────────────
  'posSoon.badge': 'Segera hadir',
  'posSoon.back': 'Kembali ke dasbor',

  // ── Quick Store list ──────────────────────────────────────────────────────
  'qs.title': 'Quick Store',
  'qs.subtitle': 'Kelola toko mikro Anda — item, anggota, dan pembayaran.',
  'qs.newStore': 'Toko Baru',
  'qs.empty.title': 'Belum ada toko',
  'qs.empty.subtitle': 'Buat toko pertama Anda untuk mulai berjualan.',
  'qs.empty.cta': 'Buat Toko',
  'qs.open': 'Buka',
  'qs.closed': 'Tutup',
  'qs.openLink': 'Masuk →',
  'qs.loadFailed': 'Gagal memuat daftar toko',
  'qs.created': 'Toko "{name}" berhasil dibuat!',

  // ── 404 / Not found ───────────────────────────────────────────────────────
  'nf.badge': 'Galat 404',
  'nf.title': 'Halaman tidak ditemukan',
  'nf.body': 'Halaman yang Anda cari tidak tersedia.',
  'nf.back': 'Kembali ke beranda',
  'nf.redirecting': 'Mengalihkan ke beranda dalam {seconds} detik',
  'nf.redirectingOne': 'Mengalihkan ke beranda dalam 1 detik',
  'nf.redirectingNow': 'Mengalihkan sekarang…',
}

// ─────────────────────────────────────────────────────────────────────────────
// QuickStore phrase dictionary.
// The English sentence IS the key: EN renders the source text verbatim and only
// the Indonesian side is maintained below, so a phrase can never show up as a
// raw key in the UI (worst case it stays English).
// `{name}`-style placeholders are interpolated by `translate`.
// ─────────────────────────────────────────────────────────────────────────────

const phraseId = {
  // ── Common ────────────────────────────────────────────────────────────────
  Add: 'Tambah',
  Cancel: 'Batal',
  Delete: 'Hapus',
  'Delete?': 'Hapus?',
  Edit: 'Ubah',
  'Try again': 'Coba lagi',
  Yes: 'Ya',
  No: 'Tidak',
  Total: 'Total',
  Subtotal: 'Subtotal',
  Discounts: 'Diskon',
  Cashier: 'Kasir',
  'To Cashier': 'Ke Kasir',
  Open: 'Buka',
  Closed: 'Tutup',
  Close: 'Tutup',
  // The `STATUS: open • ROLE: admin` line prints the state inline (green / red)
  // instead of as a badge — these are the lower-case words it uses.
  open: 'buka',
  closed: 'tutup',
  'STATUS:': 'STATUS:',
  'ROLE:': 'PERAN:',
  Name: 'Nama',
  Description: 'Deskripsi',
  'Store Name': 'Nama Toko',
  Available: 'Tersedia',
  Unavailable: 'Tidak tersedia',
  Items: 'Item',
  History: 'Riwayat',
  Members: 'Anggota',
  Settings: 'Pengaturan',
  'Add Item': 'Tambah Item',
  'Delete failed': 'Gagal menghapus',
  'Save failed': 'Gagal menyimpan',
  'Remove failed': 'Gagal menghapus anggota',
  'Upload failed': 'Gagal mengunggah',
  'Something went wrong': 'Terjadi kesalahan',
  'Payment QR': 'QR Pembayaran',
  'QR preview': 'Pratinjau QR',
  'Store not found': 'Toko tidak ditemukan',
  'Back to store': 'Kembali ke toko',
  'Back to Quick Store': 'Kembali ke Quick Store',
  'Customers can browse and buy': 'Pelanggan dapat melihat dan membeli',
  '{count} item': '{count} item',
  '{count} items': '{count} item',
  '{count} line': '{count} baris',
  '{count} lines': '{count} baris',
  '{count} member': '{count} anggota',
  '{count} members': '{count} anggota',
  '{count} in stock': 'sisa {count}',

  // ── Store detail page ─────────────────────────────────────────────────────
  'Failed to load store': 'Gagal memuat toko',
  'Delete store "{name}"? This cannot be undone.':
    'Hapus toko "{name}"? Tindakan ini tidak dapat dibatalkan.',
  'Store deleted': 'Toko dihapus',
  'Delete Store': 'Hapus Toko',

  // ── Create store dialog ───────────────────────────────────────────────────
  'Store name is required': 'Nama toko wajib diisi',
  'Failed to create store': 'Gagal membuat toko',
  'Create New Store': 'Buat Toko Baru',
  'Set up your micro-store in seconds.': 'Siapkan toko mikro Anda dalam hitungan detik.',
  'e.g. Kopi Kevin': 'mis. Kopi Kevin',
  'Short description of your store...': 'Deskripsi singkat toko Anda...',
  'Open for orders': 'Buka untuk pesanan',
  'Payment QR (optional)': 'QR Pembayaran (opsional)',
  'Description (optional)': 'Deskripsi (opsional)',
  optional: 'opsional',
  'Click to upload (PNG, JPG, max 2 MB)': 'Klik untuk mengunggah (PNG, JPG, maks 2 MB)',
  'Create Store': 'Buat Toko',

  // ── Items tab ─────────────────────────────────────────────────────────────
  'Failed to load items': 'Gagal memuat item',
  'Delete "{name}"?': 'Hapus "{name}"?',
  '"{name}" deleted': '"{name}" dihapus',
  'No items yet': 'Belum ada item',
  'Add your first item to get started.': 'Tambahkan item pertama Anda untuk memulai.',
  'No items have been added.': 'Belum ada item yang ditambahkan.',
  'Unlimited stock': 'Stok tidak terbatas',
  '{count} sold': '{count} terjual',
  'Item updated': 'Item diperbarui',
  '"{name}" added': '"{name}" ditambahkan',

  // ── Items tab — table (search / filter / sort / paging) ───────────────────
  'Search items…': 'Cari item…',
  Availability: 'Ketersediaan',
  All: 'Semua',
  'Available only': 'Tersedia',
  'Unavailable only': 'Tidak Tersedia',
  'Sort by': 'Urutkan',
  Stock: 'Stok',
  Sold: 'Terjual',
  Newest: 'Terbaru',
  Ascending: 'Naik',
  Descending: 'Turun',
  Actions: 'Aksi',
  Pinned: 'Disematkan',
  'Edit item': 'Ubah item',
  'Delete item': 'Hapus item',
  'Delete Item': 'Hapus Item',
  'Delete "{name}"? This cannot be undone.': 'Hapus "{name}"? Tindakan ini tidak dapat dibatalkan.',
  'No items match your filters': 'Tidak ada item yang cocok dengan filter',
  'Try a different search or reset the filters.':
    'Coba kata kunci lain atau setel ulang filternya.',
  'Clear filters': 'Reset filter',
  // Pager: `{from}–{to} of {total}` reads as "1–10 dari 241".
  '{from}–{to} of {total}': '{from}–{to} dari {total}',
  'Rows per page': 'Baris per halaman',
  '{count} per page': '{count} per halaman',
  'Page {page} of {pages}': 'Halaman {page} dari {pages}',
  Previous: 'Sebelumnya',
  Next: 'Berikutnya',

  // ── Item dialog ───────────────────────────────────────────────────────────
  'Item name is required': 'Nama item wajib diisi',
  'Edit Item': 'Ubah Item',
  'Add New Item': 'Tambah Item Baru',
  'Update item details.': 'Perbarui detail item.',
  'Add a new item to your store.': 'Tambahkan item baru ke toko Anda.',
  'e.g. Kopi Susu': 'mis. Kopi Susu',
  'Short description...': 'Deskripsi singkat...',
  Price: 'Harga',
  'Stocks (leave blank = unlimited)': 'Stok (kosongkan = tak terbatas)',
  'Discount %': 'Diskon %',
  'Stocks must be between 0 and {max}': 'Stok harus antara 0 dan {max}',
  'Discount must be between 0 and 100': 'Diskon harus antara 0 dan 100',
  'Show to customers': 'Tampilkan ke pelanggan',
  'Save Changes': 'Simpan Perubahan',

  // ── Store detail: tab navigation ──────────────────────────────────────────
  'Store navigation': 'Navigasi toko',

  // ── Members tab & invite dialog ───────────────────────────────────────────
  'Failed to load members': 'Gagal memuat anggota',
  'Remove {name} from store?': 'Hapus {name} dari toko?',
  'Member removed': 'Anggota dihapus',
  'Invite Member': 'Undang Anggota',
  'No other members': 'Belum ada anggota lain',
  'Invite collaborators to help manage this store.':
    'Undang kolaborator untuk membantu mengelola toko ini.',
  '{name} invited as {role}': '{name} diundang sebagai {role}',
  'Email is required': 'Email wajib diisi',
  'Enter a valid email address': 'Masukkan alamat email yang valid',
  'Invite failed': 'Gagal mengundang',
  'Invite a registered user to collaborate on this store.':
    'Undang pengguna terdaftar untuk berkolaborasi di toko ini.',
  'Email Address': 'Alamat Email',
  Role: 'Peran',
  'Admin — manages items & open status': 'Admin — mengelola item & status buka',
  'Master — full control':
    'Master — kendali penuh',
  'Send Invite': 'Kirim Undangan',
  Remove: 'Hapus',
  'Remove Member': 'Hapus Anggota',
  'Remove "{name}" from this store? Their past sales stay in the history.':
    'Hapus "{name}" dari toko ini? Riwayat penjualannya tetap tersimpan.',
  'Change Role': 'Ubah Peran',
  'Set what {name} can do in this store.': 'Tentukan akses {name} di toko ini.',
  '{name} is now {role}': '{name} sekarang {role}',
  Owner: 'Pemilik',
  You: 'Anda',
  'Joined {date}': 'Bergabung {date}',
  'Role updated {date}': 'Peran diubah {date}',
  'Only the store master can invite, re-role or remove members.':
    'Hanya master toko yang dapat mengundang, mengubah peran, atau menghapus anggota.',

  // ── Store settings tab ────────────────────────────────────────────────────
  'Update failed': 'Gagal memperbarui',
  'Store settings saved': 'Pengaturan toko disimpan',
  'Open for Orders': 'Buka untuk Pesanan',
  'Payment QR Code': 'Kode QR Pembayaran',
  'Click to change': 'Klik untuk mengubah',
  'Upload payment QR (PNG, JPG, max 2 MB)':
    'Unggah QR pembayaran (PNG, JPG, maks 2 MB)',
  'Save Settings': 'Simpan Pengaturan',
  'Store': 'Toko',
  'Store Details': 'Detail Toko',
  'Manage your store profile, status, and payment configuration.':
    'Kelola profil toko, status, dan konfigurasi pembayaran Anda.',
  'Store Credential': 'Kredensial Toko',
  'Only the store master can change these settings.':
    'Hanya master toko yang dapat mengubah pengaturan ini.',
  'You can change the open status only — store details and the payment credential are master-only.':
    'Anda hanya dapat mengubah status buka/tutup — detail toko dan kredensial pembayaran hanya untuk master.',
  'Only the store master can change the payment QR':
    'Hanya master toko yang dapat mengubah QR pembayaran',
  'Delete this store? This cannot be undone.':
    'Hapus toko ini? Tindakan ini tidak dapat dibatalkan.',
  'Permanently delete this store, its items, members and sales history. This cannot be undone.':
    'Hapus permanen toko ini beserta item, anggota, dan riwayat penjualannya. Tindakan ini tidak dapat dibatalkan.',

  // ── History tab ───────────────────────────────────────────────────────────
  'Failed to load history': 'Gagal memuat riwayat',
  'No sales yet': 'Belum ada penjualan',
  'Completed cashier checkouts appear here.':
    'Transaksi kasir yang sudah selesai akan muncul di sini.',
  '{count} recorded sales · newest first': '{count} penjualan tercatat · terbaru dulu',
  'Unknown cashier': 'Kasir tidak diketahui',

  // ── History tab — dashboard ───────────────────────────────────────────────
  Today: 'Hari ini',
  'Last 7 days': '7 hari terakhir',
  'Last 30 days': '30 hari terakhir',
  'This month': 'Bulan ini',
  'All time': 'Semua waktu',
  Custom: 'Kustom',
  From: 'Dari',
  To: 'Sampai',
  'All recorded sales': 'Semua penjualan tercatat',
  Revenue: 'Pendapatan',
  Sales: 'Penjualan',
  'Items sold': 'Item terjual',
  'Average sale': 'Rata-rata penjualan',
  'Revenue trend': 'Tren pendapatan',
  'Peak hours': 'Jam tersibuk',
  'Revenue by hour': 'Pendapatan per jam',
  'By day': 'Per hari',
  'By week': 'Per minggu',
  'By month': 'Per bulan',
  'Top items': 'Item terlaris',
  'Best sellers': 'Paling banyak terjual',
  'Top cashiers': 'Kasir terbaik',
  '{count} sale': '{count} penjualan',
  '{count} sales': '{count} penjualan',
  'No sales in this range': 'Tidak ada penjualan pada rentang ini',
  'Pick another date range or ring up a sale in the cashier.':
    'Pilih rentang tanggal lain atau catat penjualan di kasir.',
  Transactions: 'Transaksi',
  'Search receipts…': 'Cari struk…',
  'All statuses': 'Semua status',
  Completed: 'Selesai',
  Voided: 'Dibatalkan',
  'No receipts match': 'Tidak ada struk yang cocok',
  'Adjust the search, status or date range.':
    'Sesuaikan pencarian, status, atau rentang tanggalnya.',
  Status: 'Status',

  // ── History: CSV export ───────────────────────────────────────────────────
  'Export CSV': 'Ekspor CSV',
  'Exporting…': 'Mengekspor…',
  Date: 'Tanggal',
  Item: 'Item',
  Quantity: 'Jumlah',
  'Unit price': 'Harga satuan',
  'Line total': 'Total baris',
  'Receipts exported': 'Struk berhasil diekspor',
  'Receipt exported': 'Struk berhasil diekspor',
  'No receipts to export': 'Tidak ada struk untuk diekspor',
  'Failed to export receipts': 'Gagal mengekspor struk',
  'Export PNG': 'Ekspor PNG',
  'Receipt image exported': 'Gambar struk berhasil diunduh',
  'Failed to export the receipt image': 'Gagal membuat gambar struk',

  // ── Cashier: product search ───────────────────────────────────────────────
  'Search products': 'Cari produk',
  'Type a product name…': 'Ketik nama produk…',
  'Start typing to search products': 'Mulai mengetik untuk mencari produk',
  'No product matches "{query}"': 'Tidak ada produk yang cocok dengan "{query}"',
  '{count} left': 'sisa {count}',
  'Product no longer exists': 'Produk sudah tidak ada',

  // ── Cashier: sale cart ────────────────────────────────────────────────────
  'Cart is empty': 'Keranjang kosong',
  'Search for a product above to start the sale.':
    'Cari produk di atas untuk memulai penjualan.',
  'Search for a product above, or tap a suggestion to add it.':
    'Cari produk di atas, atau tekan saran untuk menambahkannya.',
  Clear: 'Kosongkan',
  '{price} each': '{price} / item',
  'Decrease quantity of {name}': 'Kurangi jumlah {name}',
  'Quantity of {name}': 'Jumlah {name}',
  'Increase quantity of {name}': 'Tambah jumlah {name}',
  'Quantity must be a whole number of at least 1': 'Jumlah harus bilangan bulat minimal 1',
  'Remove {name} from the sale': 'Hapus {name} dari penjualan',

  // ── Cashier: receipt panel ────────────────────────────────────────────────
  'Receipt and checkout': 'Struk dan pembayaran',
  Receipt: 'Struk',
  'Cashier: {name}': 'Kasir: {name}',
  'Scan to pay': 'Pindai untuk membayar',
  'Payment Code': 'Kode Pembayaran',
  'Show this QR to the customer.':
    'Tunjukkan QR ini ke pelanggan.',
  'No payment QR configured — add one in the store settings.':
    'Belum ada QR pembayaran — tambahkan di pengaturan toko.',
  'Sale recorded': 'Penjualan tercatat',
  'Stock has been reduced and the sale saved to QuickStore history as':
    'Stok sudah dikurangi dan penjualan disimpan ke riwayat QuickStore sebagai',
  'New sale': 'Penjualan baru',
  'Confirm in {seconds}s…': 'Konfirmasi dalam {seconds} dtk…',
  Confirm: 'Konfirmasi',
  'Review the receipt, then confirm to start the 3-second safeguard.':
    'Periksa struk, lalu konfirmasi untuk memulai pengaman 3 detik.',
  'Confirm once the customer has paid.': 'Konfirmasi setelah pelanggan membayar.',
  'Customer Paid?': 'Pelanggan Sudah Bayar?',
  'This action cannot be undone.':
    'Aksi ini tidak dapat dikembalikan.',
  'Recording sale…': 'Mencatat penjualan…',
  'Checkout failed': 'Pembayaran gagal',
  'Nothing has been recorded. Fix the items above and confirm again.':
    'Tidak ada yang tercatat. Perbaiki item di atas lalu konfirmasi lagi.',
  'Back to confirm': 'Kembali ke konfirmasi',
  'Store closed': 'Toko tutup',
  'Nothing to sell yet.':
    'Belum ada yang ditambahkan.',
  '(list {price})': '(harga {price})',

  // ── Cashier page ──────────────────────────────────────────────────────────
  Forbidden: 'Akses ditolak',
  'Failed to load products': 'Gagal memuat produk',
  'Failed to load the cashier': 'Gagal memuat kasir',
  'Could not refresh stock': 'Tidak dapat memperbarui stok',
  'Sale {number} recorded': 'Penjualan {number} tercatat',
  'You cannot ring up sales here': 'Anda tidak dapat mencatat penjualan di sini',
  'Your role in this store does not allow checking out.':
    'Peran Anda di toko ini tidak mengizinkan pembayaran.',
  "Enter the customer's items, review the receipt, then confirm the payment.":
    'Masukkan item pelanggan, periksa struk, lalu konfirmasi pembayaran.',
  'Refresh stock': 'Perbarui stok',
  'No products yet': 'Belum ada produk',
  'Add items to this store before you can ring up a sale.':
    'Tambahkan item ke toko ini sebelum mencatat penjualan.',
  'Add items': 'Tambah item',
  Review: 'Periksa',
  'Review & pay': 'Periksa & bayar',

  // ── Cashier: voice order ──────────────────────────────────────────────────
  'Voice order': 'Pesanan suara',
  Language: 'Bahasa',
  'Voice language': 'Bahasa suara',
  'Start voice order': 'Mulai pesanan suara',
  'Stop and interpret': 'Hentikan & proses',
  'Listening…': 'Mendengarkan…',
  'Interpreting the order…': 'Memproses pesanan…',
  'Say e.g. "three pencils, four pens".':
    'Sebutkan mis. "tiga pensil, empat pena".',
  'Tap to speak': 'tekan untuk bicara',
  Discard: 'Buang',
  'Press the mic to interpret it.': 'Tekan mikrofon untuk memprosesnya.',
  'Detected items': 'Item terdeteksi',
  'Not in this store: "{heard}"': 'Tidak ada di toko ini: "{heard}"',
  'Add {count} to sale': 'Tambahkan {count} ke penjualan',
  'Nothing was heard. Please try again.': 'Tidak ada suara yang terdengar. Coba lagi.',
  'No matching item was detected in this store. Try saying the product name again.':
    'Tidak ada item yang cocok di toko ini. Coba sebutkan nama produknya lagi.',
  'Those products are no longer in this store. Refresh the catalog.':
    'Produk tersebut sudah tidak ada di toko ini. Segarkan daftar produk.',
  'Unavailable items were skipped: {count}': 'Item tidak tersedia diabaikan: {count}',
  'Voice input is not supported in this browser. Use Chrome or Edge.':
    'Input suara tidak didukung di browser ini. Gunakan Chrome atau Edge.',
  'Microphone access was blocked. Allow it in your browser, then try again.':
    'Akses mikrofon diblokir. Izinkan di browser Anda, lalu coba lagi.',
  'No microphone was found on this device.': 'Tidak ada mikrofon di perangkat ini.',
  'The speech service is unreachable. Check your connection.':
    'Layanan suara tidak dapat dijangkau. Periksa koneksi Anda.',
  'Listening was stopped.': 'Perekaman dihentikan.',
  'Voice input failed. Please try again.': 'Input suara gagal. Coba lagi.',
} as const

export type PhraseKey = keyof typeof phraseId

const phraseEn = Object.fromEntries(
  Object.keys(phraseId).map((key) => [key, key])
) as Record<PhraseKey, string>

export const translations: Record<Language, Record<string, string>> = {
  EN: { ...en, ...phraseEn },
  ID: { ...id, ...phraseId },
}

export function translate(
  lang: Language,
  key: TranslationKey,
  vars?: Record<string, string | number>
) {
  let text: string = translations[lang][key] ?? key

  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value))
    }
  }

  return text
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain messages (availability + checkout errors)
// These come from the pure cashier domain as English text, so EN keeps the
// original message and only the Indonesian side is mapped here.
// ─────────────────────────────────────────────────────────────────────────────

const availabilityLabelId: Record<AvailabilityCode, string> = {
  ok: 'Tersedia',
  invalid_quantity: 'Jumlah tidak valid',
  over_limit: 'Jumlah terlalu besar',
  unavailable: 'Tidak tersedia',
  out_of_stock: 'Stok habis',
  insufficient_stock: 'Stok tidak cukup',
}

const availabilityMessageId: Record<AvailabilityCode, string> = {
  ok: '',
  invalid_quantity: 'Jumlah harus bilangan bulat minimal 1',
  over_limit: 'Maksimal {max} per item',
  unavailable: '{name} sedang tidak tersedia',
  out_of_stock: 'Stok {name} habis',
  insufficient_stock: 'Hanya tersisa {stocks} {name}',
}

const checkoutErrorId: Record<CheckoutErrorCode | 'CHECKOUT_FAILED', string> = {
  EMPTY_CART: 'Keranjang masih kosong',
  INVALID_REQUEST: 'Permintaan tidak valid',
  INVALID_QUANTITY: 'Jumlah tidak valid',
  TOO_MANY_LINES: 'Terlalu banyak jenis item dalam satu penjualan',
  PRODUCT_NOT_FOUND: 'Produk tidak ditemukan',
  PRODUCT_UNAVAILABLE: 'Produk tidak tersedia',
  INSUFFICIENT_STOCK: 'Stok tidak cukup',
  STORE_NOT_FOUND: 'Toko tidak ditemukan',
  CHECKOUT_FAILED: 'Pembayaran gagal, silakan coba lagi',
}

/**
 * Messages the QuickStore API answers with (validation / permission errors).
 * They are shown straight from `err.message`, so they are mapped here by their
 * exact English text.
 */
const serverMessageId: Record<string, string> = {
  Unauthorized: 'Tidak memiliki akses',
  Forbidden: 'Akses ditolak',
  'Invalid JSON body': 'Format data tidak valid',
  'Store not found': 'Toko tidak ditemukan',
  'Store name is required': 'Nama toko wajib diisi',
  'Store name cannot be empty': 'Nama toko tidak boleh kosong',
  'Item not found': 'Item tidak ditemukan',
  'Item name is required': 'Nama item wajib diisi',
  'Item name cannot be empty': 'Nama item tidak boleh kosong',
  'An item with this name already exists': 'Item dengan nama ini sudah ada',
  'Name must be 20 characters or less': 'Nama maksimal 20 karakter',
  'Description is required': 'Deskripsi wajib diisi',
  'Description must be 100 characters or less': 'Deskripsi maksimal 100 karakter',
  'Description must be 50 characters or less': 'Deskripsi maksimal 50 karakter',
  'Price must be numbers only': 'Harga harus berupa angka saja',
  'Stocks must be between 0 and 999': 'Stok harus antara 0 dan 999',
  'discountPercent must be 0-100': 'Diskon harus bernilai 0-100',
  'Email is required': 'Email wajib diisi',
  'Cannot invite yourself': 'Tidak dapat mengundang diri sendiri',
  'No user found with that email': 'Tidak ada pengguna dengan email tersebut',
  'User is already a member of this store': 'Pengguna sudah menjadi anggota toko ini',
  'Member not found': 'Anggota tidak ditemukan',
  'The store owner is always the master': 'Pemilik toko selalu menjadi master',
  'You cannot change your own membership': 'Anda tidak dapat mengubah keanggotaan Anda sendiri',
  'Invalid role': 'Peran tidak valid',
  'No file provided': 'Tidak ada file yang dipilih',
  'Upload failed': 'Gagal mengunggah',
  'Failed to load history': 'Gagal memuat riwayat',
  'Failed to load store': 'Gagal memuat toko',
  'Failed to load products': 'Gagal memuat produk',
  'Failed to load the cashier': 'Gagal memuat kasir',
  'Checkout failed': 'Pembayaran gagal',
  'Checkout failed, please try again': 'Pembayaran gagal, silakan coba lagi',
  'Insufficient stock': 'Stok tidak cukup',
  'Nothing was heard, please try again': 'Tidak ada suara yang terdengar, coba lagi',
  'Could not understand the order, please try again':
    'Tidak dapat memahami pesanan, coba lagi',
  'Voice interpretation failed, please try again': 'Gagal memproses suara, coba lagi',
  'This store has no items to order yet': 'Toko ini belum punya item untuk dipesan',
  "language must be 'EN' or 'ID'": 'Bahasa harus EN atau ID',
  'transcript is required': 'Transkrip suara wajib diisi',
  'open must be a boolean': 'Status buka harus berupa boolean',
  'paymentQr must be a URL string or null': 'QR pembayaran harus berupa URL atau null',
}

/** Translate a message that came from the API (already English). */
export function serverText(lang: Language, english: string) {
  if (lang !== 'ID') return english
  return serverMessageId[english] ?? english
}

function withVars(text: string, vars?: Record<string, string | number>) {
  if (!vars) return text
  let result = text
  for (const [name, value] of Object.entries(vars)) {
    result = result.split(`{${name}}`).join(String(value))
  }
  return result
}

/** Short availability label ("Out of stock") for the current language. */
export function availabilityText(
  lang: Language,
  code: AvailabilityCode,
  english: string
) {
  return lang === 'ID' ? availabilityLabelId[code] ?? english : english
}

/** Detailed availability message, e.g. `Only 2 Latte left`. */
export function availabilityMessage(
  lang: Language,
  code: AvailabilityCode,
  english: string,
  vars?: Record<string, string | number>
) {
  if (lang !== 'ID') return english
  return withVars(availabilityMessageId[code] ?? english, vars)
}

/** Checkout error text — the API/domain message is already English. */
export function checkoutErrorText(
  lang: Language,
  code: string | undefined,
  english: string
) {
  if (lang !== 'ID' || !code) return english
  return (checkoutErrorId as Record<string, string>)[code] ?? english
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

'use client'

import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import {
  ArrowUpRight,
  Check,
  ChefHat,
  Globe2,
  LogOut,
  Mail,
  Menu,
  Mic,
  Moon,
  QrCode,
  Receipt,
  ScanLine,
  Sun,
  Wallet,
  X
} from 'lucide-react'
import { signIn, signOut, useSession } from 'next-auth/react'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { GithubIcon, InstagramIcon } from '@/components/brand-icons'
import { Switch } from '@/components/ui/switch'
import { UserAvatar } from '@/components/user-avatar'
import {
  getLanguageSnapshot,
  getServerLanguageSnapshot,
  getServerThemeSnapshot,
  getThemeSnapshot,
  setLanguage,
  subscribePreferences,
  toggleLanguage,
  toggleTheme
} from '@/lib/preferences'

const copy = {
  EN: {
    nav: ['Product', 'Workflow', 'Pricing'],
    badge: 'POS / QUICKSTORE / KDS',
    headline: 'The quiet system behind busy businesses.',
    // Three parts so the middle one can be emphasised in the hero.
    body: [
      'CrossCart keeps transactions, stock, and kitchen orders moving in one calm ',
      '100% money free',
      ' workspace.'
    ],
    primary: 'Log In',
    toDashboard: 'To Dashboard',
    signOut: 'Sign out',
    language: 'Language',
    emailCopied: 'Email Copied!',
    secondary: 'Explore the workflow',
    demo: 'Demo Test (No Login)',
    proof: 'Free forever. No transaction fees.',
    pulse: 'Today at a glance',
    revenue: 'Today’s revenue',
    orders: 'Orders processed',
    stock: 'Low stock items',
    live: 'Live activity',
    workflowLabel: 'Two system. Six moments. 100% Free Forever',
    workflowTitle: 'Designed around the way work actually happens.',
    workflowBody: 'Less switching. Fewer mistakes. A faster day for every operator.',
    pricing: 'Everything you need. Nothing you need to unlock.',
    pricingBody: 'No subscriptions, limits, or payment processing markups. Just a focused toolkit for people running businesses. Made with Passion.',
    cta: 'Open CrossCart',
    footer: 'Built for every counter, table, and shift.',
    // Two products, three moments each.
    systems: [
      {
        name: 'QuickStore',
        note: 'Instant cashier, driven by voice.',
        steps: [
          {
            icon: Mic,
            title: 'Customer shows their items',
            body: 'Walk in, show what you need, and the sale starts without typing.'
          },
          {
            icon: Receipt,
            title: 'Speak the order out loud',
            body: 'A short line — “five chocolates, four syrups, a book” — becomes a receipt.'
          },
          {
            icon: Wallet,
            title: 'Pay outside the app',
            body: 'Cash, transfer, or QRIS. No money ever passes through CrossCart.'
          }
        ]
      },
      {
        name: 'Modern POS',
        note: 'QR ordering, from table to kitchen.',
        steps: [
          {
            icon: QrCode,
            title: 'Customer scans and orders',
            body: 'One QR code opens the menu and places the order from the guest’s phone.'
          },
          {
            icon: ScanLine,
            title: 'Cashier confirms the code',
            body: 'The order code is verified at the counter and settled outside the app.'
          },
          {
            icon: ChefHat,
            title: 'Kitchen receives the ticket',
            body: 'The guest stays seated while incoming orders reach the kitchen in real time.'
          }
        ]
      }
    ],
    /**
     * Frames the hero mockup loops through. Numbers, the live feed and the chart
     * are swapped together, so the "overview" screen reads as a running system
     * instead of a screenshot. Times stay descending inside each frame.
     */
    pulseFrames: [
      {
        revenue: 'Rp 4.28m',
        revenueNote: '+18.4% this week',
        orders: '184',
        ordersNote: '12 in progress',
        stock: '07',
        stockNote: 'Needs attention',
        activity: [
          ['10:42', 'Voice cart completed', '5 items', 'Rp 184.500'],
          ['10:39', 'Table 07 sent to kitchen', '3 items', 'PREPARING'],
          ['10:35', 'Stock updated', 'Iced Latte · 24 left', 'SYNCED']
        ],
        bars: [35, 52, 43, 68, 57, 82, 74, 94, 70, 88, 100, 86]
      },
      {
        revenue: 'Rp 4.51m',
        revenueNote: '+20.6% this week',
        orders: '196',
        ordersNote: '14 in progress',
        stock: '05',
        stockNote: 'Needs attention',
        activity: [
          ['10:58', 'New order · Table 12', '2 items', 'NEW'],
          ['10:51', 'Voice cart completed', '6 items', 'Rp 212.000'],
          ['10:47', 'Kitchen marked ready', 'Plate 3 of 5', 'READY']
        ],
        bars: [35, 52, 43, 70, 61, 82, 78, 94, 88, 96, 100, 92]
      },
      {
        revenue: 'Rp 4.73m',
        revenueNote: '+24.9% this week',
        orders: '211',
        ordersNote: '9 in progress',
        stock: '12',
        stockNote: 'Restocked',
        activity: [
          ['11:14', 'Stock updated', 'Butter Croissant · 8 left', 'SYNCED'],
          ['11:09', 'New order · Table 04', '4 items', 'NEW'],
          ['11:02', 'Payment confirmed', 'Cash · Rp 96.500', 'PAID']
        ],
        bars: [42, 48, 55, 64, 71, 66, 84, 79, 91, 86, 96, 100]
      }
    ]
  },
  ID: {
    nav: ['Produk', 'Alur kerja', 'Harga'],
    badge: 'POS / QUICKSTORE / KDS',
    headline: 'Sistem tenang di balik bisnis yang sibuk.',
    // Three parts so the middle one can be emphasised in the hero.
    body: [
      'CrossCart menyatukan transaksi, stok, dan pesanan dapur dalam satu ruang kerja yang tenang — ',
      '100% tanpa uang',
      '.'
    ],
    primary: 'Masuk',
    toDashboard: 'Ke Dasbor',
    signOut: 'Keluar',
    language: 'Bahasa',
    emailCopied: 'Email Tersalin!',
    secondary: 'Lihat alur kerja',
    demo: 'Tes Demo (No Login)',
    proof: 'Gratis selamanya. Tanpa biaya transaksi.',
    pulse: 'Ringkasan hari ini',
    revenue: 'Pendapatan hari ini',
    orders: 'Pesanan diproses',
    stock: 'Stok menipis',
    live: 'Aktivitas langsung',
    workflowLabel: 'Dua sistem. Enam momen. Gratis 100% Selamanya.',
    workflowTitle: 'Dibuat mengikuti cara kerja nyata.',
    workflowBody: 'Lebih sedikit berpindah. Lebih sedikit salah. Hari yang lebih cepat.',
    pricing: 'Semua yang dibutuhkan. Tanpa fitur terkunci.',
    pricingBody: 'Tanpa langganan, batasan, atau markup pemrosesan pembayaran. Hanya alat yang fokus untuk orang yang menjalankan bisnis. Dibuat dengan Passion.',
    cta: 'Buka CrossCart',
    footer: 'Dibuat untuk setiap kasir, meja, dan shift.',
    // Dua produk, masing-masing tiga momen.
    systems: [
      {
        name: 'QuickStore',
        note: 'Kasir instan dengan suara.',
        steps: [
          {
            icon: Mic,
            title: 'Pelanggan tunjukkan barang',
            body: 'Datang, tunjukkan barangnya, dan transaksi langsung dimulai tanpa mengetik.'
          },
          {
            icon: Receipt,
            title: 'Sebutkan pesanannya',
            body: 'Satu kalimat — “lima cokelat, empat sirup, satu buku” — langsung jadi struk.'
          },
          {
            icon: Wallet,
            title: 'Bayar di luar aplikasi',
            body: 'Tunai, transfer, atau QRIS. Tidak ada uang yang lewat CrossCart.'
          }
        ]
      },
      {
        name: 'Modern POS',
        note: 'Pesanan QR dari meja sampai dapur.',
        steps: [
          {
            icon: QrCode,
            title: 'Pelanggan pindai lalu pesan',
            body: 'Satu kode QR membuka menu dan membuat pesanan dari ponsel pelanggan.'
          },
          {
            icon: ScanLine,
            title: 'Kasir verifikasi kode',
            body: 'Kode pesanan diperiksa di kasir, pembayarannya tetap di luar aplikasi.'
          },
          {
            icon: ChefHat,
            title: 'Dapur langsung terima pesanan',
            body: 'Pelanggan bisa duduk tenang, pesanan masuk ke dapur secara real time.'
          }
        ]
      }
    ],
    /**
     * Iterasi mockup hero: angka, feed aktivitas, dan grafiknya berubah bersama,
     * jadi layar "ringkasan" terlihat seperti sistem yang sedang berjalan.
     */
    pulseFrames: [
      {
        revenue: 'Rp 4,28 jt',
        revenueNote: '+18,4% minggu ini',
        orders: '184',
        ordersNote: '12 diproses',
        stock: '07',
        stockNote: 'Perlu perhatian',
        activity: [
          ['10:42', 'Keranjang suara selesai', '5 item', 'Rp 184.500'],
          ['10:39', 'Meja 07 dikirim ke dapur', '3 item', 'DIPROSES'],
          ['10:35', 'Stok diperbarui', 'Iced Latte · sisa 24', 'TERSINKRON']
        ],
        bars: [35, 52, 43, 68, 57, 82, 74, 94, 70, 88, 100, 86]
      },
      {
        revenue: 'Rp 4,51 jt',
        revenueNote: '+20,6% minggu ini',
        orders: '196',
        ordersNote: '14 diproses',
        stock: '05',
        stockNote: 'Perlu perhatian',
        activity: [
          ['10:58', 'Pesanan baru · Meja 12', '2 item', 'BARU'],
          ['10:51', 'Keranjang suara selesai', '6 item', 'Rp 212.000'],
          ['10:47', 'Dapur menandai siap', 'Piring 3 dari 5', 'SIAP']
        ],
        bars: [35, 52, 43, 70, 61, 82, 78, 94, 88, 96, 100, 92]
      },
      {
        revenue: 'Rp 4,73 jt',
        revenueNote: '+24,9% minggu ini',
        orders: '211',
        ordersNote: '9 diproses',
        stock: '12',
        stockNote: 'Sudah diisi',
        activity: [
          ['11:14', 'Stok diperbarui', 'Butter Croissant · sisa 8', 'TERSINKRON'],
          ['11:09', 'Pesanan baru · Meja 04', '4 item', 'BARU'],
          ['11:02', 'Pembayaran dikonfirmasi', 'Tunai · Rp 96.500', 'DIBAYAR']
        ],
        bars: [42, 48, 55, 64, 71, 66, 84, 79, 91, 86, 96, 100]
      }
    ]
  }
} as const

function Reveal({
  children,
  delay = 0,
  className = '',
  id
}: {
  children: React.ReactNode
  delay?: number
  className?: string
  id?: string
}) {
  return (
    <motion.div
      id={id}
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: false, amount: 0.2 }}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

// ── Hero mockup: the looping sample data ─────────────────────────────────────
/**
 * How long one frame of the mockup stays on screen before the next one. The
 * transitions below are deliberately slower than the frame gap needs: each change
 * finishes with a couple of seconds of stillness, which is what makes the screen
 * read as calm instead of twitchy.
 */
const PULSE_FRAME_MS = 2000
/** The landing page's shared easing — a long, soft settle. */
const PULSE_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

/**
 * One frame of the hero mockup. Spelled out by hand because `copy` is `as const`
 * — every array in it is a readonly tuple, and this is the shape the component
 * wants back out of it.
 */
type PulseFrame = {
  revenue: string
  revenueNote: string
  orders: string
  ordersNote: string
  stock: string
  stockNote: string
  activity: readonly (readonly [string, string, string, string])[]
  bars: readonly number[]
}

/**
 * A single figure inside the mockup. Re-keying it on the value itself makes React
 * mount a brand new node whenever the frame flips, so the next number drifts up
 * into place instead of blinking. The duration is long on purpose: at this speed
 * the eye follows the change instead of being startled by it.
 */
function PulseValue({
  value,
  className,
  delay = 0
}: {
  value: string
  className?: string
  delay?: number
}) {
  return (
    <motion.p
      key={value}
      initial={{ y: 10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.9, delay, ease: PULSE_EASE }}
      className={className}
    >
      {value}
    </motion.p>
  )
}

export default function Home() {
  // Theme + language live in localStorage and are read as an external store, so
  // the server render uses the defaults and hydration stays clean.
  const dark = useSyncExternalStore(subscribePreferences, getThemeSnapshot, getServerThemeSnapshot)
  const lang = useSyncExternalStore(
    subscribePreferences,
    getLanguageSnapshot,
    getServerLanguageSnapshot
  )
  const [open, setOpen] = useState(false)
  const [emailCopied, setEmailCopied] = useState(false)
  /** Which sample frame the hero mockup is showing (see `pulseFrames`). */
  const [pulseIndex, setPulseIndex] = useState(0)
  const reduceMotion = useReducedMotion()
  const { scrollYProgress } = useScroll()
  const y = useTransform(scrollYProgress, [0, 1], [0, -70])
  const { data: session } = useSession()
  const t = copy[lang]

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText('richky.abednego@gmail.com')
      setEmailCopied(true)
      window.setTimeout(() => setEmailCopied(false), 3000)
    } catch {
      setEmailCopied(false)
    }
  }

  // Keep the <html> element aligned with the stored preferences.
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', dark)
    root.classList.toggle('light', !dark)
    root.style.colorScheme = dark ? 'dark' : 'light'
  }, [dark])

  useEffect(() => {
    document.documentElement.lang = lang === 'EN' ? 'en' : 'id'
  }, [lang])

  // The hero mockup keeps itself alive: one frame every few seconds, looping.
  // It is pure decoration, so a visitor who asked for less motion keeps frame
  // one — the screen still reads, it just stops moving.
  useEffect(() => {
    if (reduceMotion === true) return
    const tick = () => setPulseIndex((current) => (current + 1) % t.pulseFrames.length)
    const timer = window.setInterval(tick, PULSE_FRAME_MS)
    return () => window.clearInterval(timer)
  }, [reduceMotion, t.pulseFrames.length])

  const pulse: PulseFrame = t.pulseFrames[pulseIndex % t.pulseFrames.length]
  /** The tallest bar of this frame is the one drawn in the primary colour. */
  const peakBar = Math.max(...pulse.bars)

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <motion.div
        style={{ scaleX: scrollYProgress }}
        className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-primary"
      />

      <header className="mx-auto flex max-w-6xl items-center justify-between border-b border-border px-5 py-5 sm:px-8">
        <a
          href="#top"
          className="font-light flex items-center gap-2 text-lg tracking-[-.04em]"
          aria-label="CrossCart home"
        >
          <span className="relative grid size-7 place-items-center overflow-hidden rounded-md bg-black">
            <Image
              src="/logo.png"
              alt="CrossCart Logo"
              width={28}
              height={28}
              className="size-full object-contain p-0.5"
            />
          </span>
          <span>
            Cross
            <span className='text-primary'>Cart</span>
          </span>

        </a>

        <nav className="hidden items-center gap-8 text-xs text-muted-foreground md:flex">
          <a href="#product" className="hover:text-foreground">
            {t.nav[0]}
          </a>
          <a href="#workflow" className="hover:text-foreground">
            {t.nav[1]}
          </a>
          <a href="#pricing" className="hover:text-foreground">
            {t.nav[2]}
          </a>
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <div className="flex items-center gap-2 text-xs">
            <span className={lang === 'EN' ? 'font-medium text-foreground' : 'text-muted-foreground'}>
              EN
            </span>
            <Switch
              checked={lang === 'ID'}
              onCheckedChange={(checked) => setLanguage(checked ? 'ID' : 'EN')}
              aria-label="Toggle language EN/ID"
            />
            <span className={lang === 'ID' ? 'font-medium text-foreground' : 'text-muted-foreground'}>
              ID
            </span>
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            className="cursor-pointer text-muted-foreground hover:text-foreground"
            aria-label="Toggle color theme"
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          {session ? (
            <div className="flex min-w-0 items-center gap-3">
              <UserAvatar
                src={session.user?.image}
                name={session.user?.name ?? session.user?.email}
              />
              <Link
                href="/dashboard"
                className="max-w-28 truncate text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {session.user?.name ?? session.user?.email}
              </Link>
              <button
                onClick={() => signOut()}
                className="p-1 text-destructive hover:text-destructive/80 cursor-pointer transition-colors"
                aria-label={t.signOut}
                title={t.signOut}
              >
                <LogOut className="size-4" />
              </button>
              <Link
                href="/dashboard"
                className="border-b border-primary pb-1 text-xs font-medium text-primary cursor-pointer"
              >
                {t.toDashboard}
              </Link>
            </div>
          ) : (
            <button
              onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
              className="border-b border-primary pb-1 text-xs font-medium text-primary cursor-pointer"
            >
              {t.primary}
            </button>
          )}
        </div>

        <button
          className="grid size-8 place-items-center border border-border md:hidden"
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </header>

      {open && (
        <div className="mx-5 flex flex-col gap-4 border-b border-border px-1 py-5 text-sm md:hidden">
          <a href="#product" onClick={() => setOpen(false)}>
            {t.nav[0]}
          </a>
          <a href="#workflow" onClick={() => setOpen(false)}>
            {t.nav[1]}
          </a>
          <a href="#pricing" onClick={() => setOpen(false)}>
            {t.nav[2]}
          </a>
          <div className="flex items-center justify-between text-muted-foreground">
            <button
              type="button"
              onClick={toggleLanguage}
              className="flex cursor-pointer items-center gap-2 text-left"
            >
              <Globe2 className="size-4" />
              <span>{t.language}</span>
            </button>
            <div className="flex items-center gap-2 text-xs">
              <span className={lang === 'EN' ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                EN
              </span>
              <Switch
                checked={lang === 'ID'}
                onCheckedChange={(checked) => setLanguage(checked ? 'ID' : 'EN')}
                aria-label="Toggle language EN/ID"
              />
              <span className={lang === 'ID' ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                ID
              </span>
            </div>
          </div>

          <button
            type="button"
            className="flex cursor-pointer items-center gap-2 text-left text-muted-foreground"
            onClick={toggleTheme}
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {dark ? 'Light mode' : 'Dark mode'}
          </button>
          {session ? (
            <div className="flex items-center gap-3 border-t border-border pt-4">
              <UserAvatar
                src={session.user?.image}
                name={session.user?.name ?? session.user?.email}
              />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {session.user?.name ?? session.user?.email}
              </span>
              <button
                onClick={() => {
                  setOpen(false)
                  signOut()
                }}
                className="shrink-0 text-destructive cursor-pointer font-bold"
              >
                {t.signOut}
              </button>
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="shrink-0 text-primary cursor-pointer"
              >
                {t.toDashboard}
              </Link>
            </div>
          ) : (
            <button
              onClick={() => {
                setOpen(false)
                signIn('google', { callbackUrl: '/dashboard' })
              }}
              className="border-t border-border pt-4 text-left text-primary cursor-pointer"
            >
              {t.primary}
            </button>
          )}
        </div>
      )}

      <section
        id="top"
        className="mx-auto max-w-6xl px-5 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-20 lg:pb-36 lg:pt-20"
      >
        <div className="grid items-end gap-16 lg:grid-cols-[.8fr_1.2fr] lg:gap-24">
          <Reveal>
            <p className="mb-6 text-3xs font-semibold tracking-[.22em] text-primary">
              {t.badge}
            </p>
            <h1 className="max-w-xl text-[clamp(2.6rem,6.5vw,6rem)] font-medium leading-[.92] tracking-[-.085em]">
              {t.headline}
            </h1>
            <p className="mt-7 max-w-sm text-sm leading-6 text-muted-foreground">
              {t.body[0]}
              <strong className="font-semibold text-foreground">{t.body[1]}</strong>
              {t.body[2]}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              {session ? (
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-3 bg-primary px-4 py-3 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
                >
                  {t.toDashboard}
                  <ArrowUpRight className="size-4" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
                  className="inline-flex cursor-pointer items-center gap-3 bg-primary px-4 py-3 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
                >
                  {t.primary}
                  <ArrowUpRight className="size-4" />
                </button>
              )}
              {/*
               * The /demo call-to-action is the one button dressed to be found:
               * a breathing aura, a sonar ring, a periodic light sweep and a live
               * dot (CSS only — see the `demo-*` animations in app/globals.css).
               * Every loop runs through `motion-safe:`, so a visitor who prefers
               * reduced motion gets the same button, perfectly still, and the
               * hover state still lifts it.
               */}
              <Link
                href="/demo"
                className="group relative inline-flex items-center gap-3 border border-primary/60 bg-primary/10 px-4 py-3 text-xs font-semibold text-primary transition-[transform,background-color,border-color,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:scale-[1.03] hover:border-primary hover:bg-primary/15 hover:shadow-[0_16px_38px_-16px_var(--primary)] focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
              >
                {/* Warm aura that slowly breathes behind the label. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute -inset-1 bg-primary/25 blur-lg motion-safe:animate-demo-breathe"
                />

                {/* Sonar ring: expands and fades, then starts over. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 border border-primary/70 motion-safe:animate-demo-halo"
                />

                {/* Light sweep, clipped to the button. */}
                <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                  <span className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-primary/40 to-transparent motion-safe:animate-demo-shimmer" />
                </span>

                {/* "Live" dot — the recording indicator read. */}
                <span aria-hidden className="relative flex size-2 shrink-0 items-center justify-center">
                  <span className="absolute inset-0 rounded-full bg-primary/70 motion-safe:animate-ping" />
                  <span className="relative size-2 rounded-full bg-primary" />
                </span>

                <span className="relative">{t.demo}</span>

                <ArrowUpRight className="relative size-4 transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1" />
              </Link>
              <a
                href="#workflow"
                className="text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
              >
                {t.secondary}
              </a>
            </div>
            <p className="mt-8 text-2xs text-muted-foreground">
              <Check className="mr-1 inline size-3.5 text-primary" />
              {t.proof}
            </p>
          </Reveal>

          <Reveal delay={0.12} className="relative" id="product">
            <motion.div
              style={{ y }}
              className="relative border border-border bg-card p-4 shadow-2xl shadow-black/10 sm:p-6"
            >
              <div className="mb-8 flex items-center justify-between border-b border-border pb-4">
                <div>
                  <p className="text-3xs font-semibold tracking-[.18em] text-primary">
                    CROSSCART / OVERVIEW
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.pulse}
                  </p>
                </div>
                <span className="flex items-center gap-2 text-3xs text-muted-foreground">
                  <span className="relative flex size-1.5 items-center justify-center">
                    <span className="absolute inset-0 rounded-full bg-emerald-400 motion-safe:animate-ping" />
                    <span className="relative size-1.5 rounded-full bg-emerald-400" />
                  </span>
                  LIVE
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="border border-border p-4">
                  <p className="text-3xs text-muted-foreground">
                    {t.revenue}
                  </p>
                  <PulseValue
                    value={pulse.revenue}
                    className="mt-3 text-xl font-medium tracking-[-.05em]"
                  />
                  <PulseValue
                    value={pulse.revenueNote}
                    delay={0.12}
                    className="mt-2 text-3xs text-emerald-500"
                  />
                </div>
                <div className="border border-border p-4">
                  <p className="text-3xs text-muted-foreground">
                    {t.orders}
                  </p>
                  <PulseValue
                    value={pulse.orders}
                    delay={0.06}
                    className="mt-3 text-xl font-medium tracking-[-.05em]"
                  />
                  <PulseValue
                    value={pulse.ordersNote}
                    delay={0.18}
                    className="mt-2 text-3xs text-muted-foreground"
                  />
                </div>
                <div className="border border-border p-4">
                  <p className="text-3xs text-muted-foreground">
                    {t.stock}
                  </p>
                  <PulseValue
                    value={pulse.stock}
                    delay={0.12}
                    className="mt-3 text-xl font-medium tracking-[-.05em]"
                  />
                  <PulseValue
                    value={pulse.stockNote}
                    delay={0.24}
                    className="mt-2 text-3xs text-primary"
                  />
                </div>
              </div>

              <div className="mt-8 grid gap-8 sm:grid-cols-[1fr_1.2fr]">
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-3xs font-semibold tracking-[.14em]">
                      {t.live}
                    </p>
                    <span className="text-3xs text-muted-foreground">
                      Last 30 min
                    </span>
                  </div>
                  <div className="space-y-4">
                    {/* The feed refreshes itself: rows leave, the rest slide up. */}
                    <AnimatePresence initial={false} mode="popLayout">
                      {pulse.activity.map(([time, label, detail, amount], i) => (
                        <motion.div
                          key={time}
                          layout
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{
                            opacity: 0,
                            y: 8,
                            // Leaves faster than it arrives and in no particular
                            // order, so the slot is never held by a ghost row.
                            transition: { duration: 0.45, ease: PULSE_EASE }
                          }}
                          transition={{
                            duration: 0.6,
                            delay: i * 0.08,
                            ease: PULSE_EASE
                          }}
                          className="flex gap-3 border-t border-border pt-3"
                        >
                          <span className="font-mono text-3xs text-muted-foreground">
                            {time}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-2xs">{label}</p>
                            <p className="mt-1 truncate text-3xs text-muted-foreground">
                              {detail}
                            </p>
                          </div>
                          <span className="text-3xs text-primary">
                            {amount}
                          </span>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>

                <div className="relative min-h-40 border border-border p-4">
                  <div className="flex justify-between text-3xs text-muted-foreground">
                    <span>Revenue flow</span>
                    <span>7 days</span>
                  </div>
                  <div className="absolute inset-x-4 bottom-5 flex h-24 items-end gap-2">
                    {/* Bars glide between frames; the tallest one is the highlight. */}
                    {pulse.bars.map((height, i) => (
                      <motion.div
                        key={i}
                        initial={false}
                        animate={{ height: `${height}%` }}
                        transition={{
                          duration: 1.6,
                          delay: i * 0.05,
                          ease: PULSE_EASE
                        }}
                        className={`flex-1 ${height === peakBar ? 'bg-primary' : 'bg-primary/20'}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </Reveal>
        </div>
      </section>

      <section className="border-y border-border">
        <div className="mx-auto grid max-w-6xl grid-cols-2 text-3xs font-semibold tracking-[.14em] text-muted-foreground sm:grid-cols-4">
          <div className="border-r border-border px-5 py-5 sm:px-8">
            ZERO FEES
          </div>
          <div className="border-b border-border px-5 py-5 sm:border-b-0 sm:px-8">
            VOICE-ASSISTED
          </div>
          <div className="border-r border-border px-5 py-5 sm:px-8">
            QR PAYLOADS
          </div>
          <div className="px-5 py-5 sm:px-8">
            EXPORT READY
          </div>
        </div>
      </section>

      <section id="workflow" className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-36">
        <Reveal>
          <div className="mb-14 grid gap-6 sm:grid-cols-[1fr_.55fr] sm:items-end">
            <div>
              <p className="mb-5 text-3xs font-semibold tracking-[.22em] text-primary">
                {t.workflowLabel}
              </p>
              <h2 className="max-w-2xl text-3xl font-medium leading-[.98] tracking-[-.07em] sm:text-5xl">
                {t.workflowTitle}
              </h2>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              {t.workflowBody}
            </p>
          </div>
        </Reveal>

        <div className="space-y-14">
          {t.systems.map((system, s) => (
            <div key={system.name}>
              <div className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-border pt-5">
                <h3 className="text-lg font-medium tracking-[-.04em]">
                  {system.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {system.note}
                </p>
              </div>

              <div className="grid border-y border-border md:grid-cols-3">
                {system.steps.map((step, i) => (
                  <Reveal key={step.title} delay={i * 0.08}>
                    <article className="group h-full border-b border-border p-6 md:border-b-0 md:border-r md:p-8 md:last:border-r-0">
                      <div className="mb-20 flex items-center justify-between">
                        <span className="grid size-9 place-items-center border border-border text-primary">
                          <step.icon className="size-4" />
                        </span>
                        <span className="font-mono text-3xs text-muted-foreground">
                          0{s * 3 + i + 1}
                        </span>
                      </div>
                      <h4 className="max-w-[190px] text-lg font-medium leading-tight tracking-[-.04em]">
                        {step.title}
                      </h4>
                      <p className="mt-4 text-sm leading-6 text-muted-foreground">
                        {step.body}
                      </p>
                      <ArrowUpRight className="mt-8 size-4 text-primary transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
                    </article>
                  </Reveal>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-5 pb-24 sm:px-8 lg:pb-36">
        <Reveal>
          <div className="grid gap-10 border-t border-border pt-12 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <p className="mb-5 text-3xs font-semibold tracking-[.22em] text-primary">
                CROSSCART / PRICING
              </p>
              <h2 className="max-w-2xl text-3xl font-medium leading-[.98] tracking-[-.07em] sm:text-5xl">
                {t.pricing}
              </h2>
              <p className="mt-6 max-w-lg text-sm leading-6 text-muted-foreground">
                {t.pricingBody}
              </p>
            </div>
            <a
              href="#top"
              className="inline-flex items-center gap-3 border border-primary px-5 py-3 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
            >
              {t.cta}
              <ArrowUpRight className="size-4" />
            </a>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-5 py-7 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span className="font-semibold text-foreground">
            <span className="text-primary">4SRG</span> crosscart
            <span className="text-primary">.</span>
          </span>
          <span>{t.footer}</span>
          <div className="flex items-center gap-4">
            <a
              href="https://www.instagram.com/richky_4srg"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="transition-colors hover:text-foreground"
            >
              <InstagramIcon className="size-3.5" />
            </a>
            <a
              href="https://github.com/zannunakiz"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              className="transition-colors hover:text-foreground"
            >
              <GithubIcon className="size-3.5" />
            </a>
            <button
              type="button"
              onClick={() => void copyEmail()}
              aria-label="Copy email address"
              className="relative flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <Mail className="size-3.5" />
              <AnimatePresence mode="wait">
                {emailCopied && (
                  <motion.span
                    key="email-copied"
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -2 }}
                    transition={{ duration: 0.18 }}
                    className="absolute right-0 bottom-full mb-2 whitespace-nowrap rounded border border-border bg-background px-2 py-1 text-2xs text-foreground shadow-sm"
                  >
                    {t.emailCopied}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
            <div className="flex items-center gap-2 text-xs">
              <span className={lang === 'EN' ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                EN
              </span>
              <Switch
                checked={lang === 'ID'}
                onCheckedChange={(checked) => setLanguage(checked ? 'ID' : 'EN')}
                aria-label="Toggle language EN/ID"
              />
              <span className={lang === 'ID' ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                ID
              </span>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              className="cursor-pointer"
              aria-label="Toggle color theme"
            >
              {dark ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
            </button>
          </div>
        </div>
      </footer>
    </main>
  )
}

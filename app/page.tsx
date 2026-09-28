'use client'

import { AnimatePresence, motion, useScroll, useTransform } from 'framer-motion'
import {
  ArrowUpRight,
  BarChart3,
  Check,
  Globe2,
  LogOut,
  Mail,
  Menu,
  Mic2,
  Moon,
  QrCode,
  Sun,
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
    badge: 'POS / INVENTORY / KDS',
    headline: 'The quiet system behind busy businesses.',
    body: 'CrossCart keeps checkout, stock, payments, and kitchen orders moving in one calm workspace.',
    primary: 'Log In',
    toDashboard: 'To Dashboard',
    signOut: 'Sign out',
    language: 'Language',
    emailCopied: 'Email Copied!',
    secondary: 'Explore the workflow',
    proof: 'Free forever. No transaction fees.',
    pulse: 'Today at a glance',
    revenue: 'Today’s revenue',
    orders: 'Orders processed',
    stock: 'Low stock items',
    live: 'Live activity',
    workflowLabel: 'One system. Three moments.',
    workflowTitle: 'Designed around the way work actually happens.',
    workflowBody: 'Less switching. Fewer mistakes. A faster day for every operator.',
    pricing: 'Everything you need. Nothing you need to unlock.',
    pricingBody: 'No subscriptions, limits, or payment processing markups. Just a focused toolkit for people running the floor.',
    cta: 'Open CrossCart',
    footer: 'Built for every counter, table, and shift.',
    features: [
      {
        icon: Mic2,
        title: 'Speak a sale into existence',
        body: 'Natural voice commands become accurate carts in seconds.'
      },
      {
        icon: QrCode,
        title: 'Carry orders from table to kitchen',
        body: 'A simple QR payload keeps guests, cashiers, and chefs aligned.'
      },
      {
        icon: BarChart3,
        title: 'See what needs attention',
        body: 'Inventory, revenue, and exports that make decisions easier.'
      }
    ],
    activity: [
      ['10:42', 'Voice cart completed', '5 items', 'Rp 184.500'],
      ['10:39', 'Table 07 sent to kitchen', '3 items', 'PREPARING'],
      ['10:35', 'Stock updated', 'Iced Latte · 24 left', 'SYNCED']
    ]
  },
  ID: {
    nav: ['Produk', 'Alur kerja', 'Harga'],
    badge: 'POS / INVENTARIS / KDS',
    headline: 'Sistem tenang di balik bisnis yang sibuk.',
    body: 'CrossCart menyatukan kasir, stok, pembayaran, dan pesanan dapur dalam satu ruang kerja.',
    primary: 'Masuk',
    toDashboard: 'Ke Dasbor',
    signOut: 'Keluar',
    language: 'Bahasa',
    emailCopied: 'Email Tersalin!',
    secondary: 'Lihat alur kerja',
    proof: 'Gratis selamanya. Tanpa biaya transaksi.',
    pulse: 'Ringkasan hari ini',
    revenue: 'Pendapatan hari ini',
    orders: 'Pesanan diproses',
    stock: 'Stok menipis',
    live: 'Aktivitas langsung',
    workflowLabel: 'Satu sistem. Tiga momen.',
    workflowTitle: 'Dibuat mengikuti cara kerja nyata.',
    workflowBody: 'Lebih sedikit berpindah. Lebih sedikit salah. Hari yang lebih cepat.',
    pricing: 'Semua yang dibutuhkan. Tanpa fitur terkunci.',
    pricingBody: 'Tanpa langganan, batasan, atau markup pemrosesan pembayaran. Hanya alat yang fokus untuk operasional Anda.',
    cta: 'Buka CrossCart',
    footer: 'Dibuat untuk setiap kasir, meja, dan shift.',
    features: [
      {
        icon: Mic2,
        title: 'Ucapkan transaksi Anda',
        body: 'Perintah suara alami menjadi keranjang akurat dalam hitungan detik.'
      },
      {
        icon: QrCode,
        title: 'Bawa pesanan dari meja ke dapur',
        body: 'Payload QR sederhana menyatukan tamu, kasir, dan koki.'
      },
      {
        icon: BarChart3,
        title: 'Tahu apa yang perlu ditangani',
        body: 'Inventaris, pendapatan, dan ekspor yang memudahkan keputusan.'
      }
    ],
    activity: [
      ['10:42', 'Keranjang suara selesai', '5 item', 'Rp 184.500'],
      ['10:39', 'Meja 07 dikirim ke dapur', '3 item', 'DIPROSES'],
      ['10:35', 'Stok diperbarui', 'Iced Latte · sisa 24', 'TERSINKRON']
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
            onClick={toggleTheme}
            className="text-muted-foreground hover:text-foreground"
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
              className="border-b border-primary pb-1 text-xs font-medium text-primary"
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
            <button type="button" onClick={toggleLanguage} className="flex items-center gap-2 text-left">
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
            className="flex items-center gap-2 text-left text-muted-foreground"
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
                className="shrink-0 text-destructive cursor-pointer"
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
              className="border-t border-border pt-4 text-left text-primary"
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
              {t.body}
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
                  className="inline-flex items-center gap-3 bg-primary px-4 py-3 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
                >
                  {t.primary}
                  <ArrowUpRight className="size-4" />
                </button>
              )}
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
                  <span className="size-1.5 rounded-full bg-emerald-400" /> LIVE
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="border border-border p-4">
                  <p className="text-3xs text-muted-foreground">
                    {t.revenue}
                  </p>
                  <p className="mt-3 text-xl font-medium tracking-[-.05em]">
                    Rp 4.28m
                  </p>
                  <p className="mt-2 text-3xs text-emerald-500">
                    +18.4% this week
                  </p>
                </div>
                <div className="border border-border p-4">
                  <p className="text-3xs text-muted-foreground">
                    {t.orders}
                  </p>
                  <p className="mt-3 text-xl font-medium tracking-[-.05em]">
                    184
                  </p>
                  <p className="mt-2 text-3xs text-muted-foreground">
                    12 in progress
                  </p>
                </div>
                <div className="border border-border p-4">
                  <p className="text-3xs text-muted-foreground">
                    {t.stock}
                  </p>
                  <p className="mt-3 text-xl font-medium tracking-[-.05em]">
                    07
                  </p>
                  <p className="mt-2 text-3xs text-primary">
                    Needs attention
                  </p>
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
                    {t.activity.map(([time, label, detail, amount]) => (
                      <div key={time} className="flex gap-3 border-t border-border pt-3">
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
                      </div>
                    ))}
                  </div>
                </div>

                <div className="relative min-h-40 border border-border p-4">
                  <div className="flex justify-between text-3xs text-muted-foreground">
                    <span>Revenue flow</span>
                    <span>7 days</span>
                  </div>
                  <div className="absolute inset-x-4 bottom-5 flex h-24 items-end gap-2">
                    {[35, 52, 43, 68, 57, 82, 74, 94, 70, 88, 100, 86].map(
                      (height, i) => (
                        <div
                          key={i}
                          className={`flex-1 ${i === 10 ? 'bg-primary' : 'bg-primary/20'
                            }`}
                          style={{ height: `${height}%` }}
                        />
                      )
                    )}
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

        <div className="grid border-y border-border md:grid-cols-3">
          {t.features.map((feature, i) => (
            <Reveal key={feature.title} delay={i * 0.08}>
              <article className="group border-b border-border p-6 md:border-b-0 md:border-r md:p-8 md:last:border-r-0">
                <div className="mb-20 flex items-center justify-between">
                  <span className="grid size-9 place-items-center border border-border text-primary">
                    <feature.icon className="size-4" />
                  </span>
                  <span className="font-mono text-3xs text-muted-foreground">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="max-w-[190px] text-lg font-medium leading-tight tracking-[-.04em]">
                  {feature.title}
                </h3>
                <p className="mt-4 text-sm leading-6 text-muted-foreground">
                  {feature.body}
                </p>
                <ArrowUpRight className="mt-8 size-4 text-primary transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
              </article>
            </Reveal>
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
            crosscart<span className="text-primary">.</span>
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
              onClick={toggleTheme}
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

'use client'

import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { useTranslation } from '@/lib/i18n'
import {
   getServerThemeSnapshot,
   getThemeSnapshot,
   subscribePreferences,
} from '@/lib/preferences'

/** Seconds shown on the countdown before the automatic redirect to `/`. */
const REDIRECT_SECONDS = 5

export default function NotFound() {
   const router = useRouter()
   // Language + theme come from the same localStorage store as the rest of the
   // app, so this screen follows EN/ID and dark/light automatically.
   const { lang, t } = useTranslation()
   const isDark = useSyncExternalStore(
      subscribePreferences,
      getThemeSnapshot,
      getServerThemeSnapshot
   )
   const reducedMotion = useReducedMotion()
   const skipMotion = reducedMotion === true
   const [seconds, setSeconds] = useState(REDIRECT_SECONDS)

   // Countdown 5 → 0, one tick per second.
   useEffect(() => {
      const timer = window.setInterval(() => {
         setSeconds((current) => (current > 0 ? current - 1 : 0))
      }, 1000)

      return () => window.clearInterval(timer)
   }, [])

   // Send the visitor back to the landing page once the countdown hits zero.
   useEffect(() => {
      if (seconds === 0) router.replace('/')
   }, [router, seconds])

   // ── On-render animation (staggered, and calm for reduced-motion users) ─────
   const container: Variants = {
      hidden: {},
      show: {
         transition: {
            staggerChildren: skipMotion ? 0 : 0.09,
            delayChildren: skipMotion ? 0 : 0.05,
         },
      },
   }

   const item: Variants = {
      hidden: skipMotion ? { opacity: 0 } : { opacity: 0, y: 16 },
      show: {
         opacity: 1,
         y: 0,
         transition: { duration: skipMotion ? 0.15 : 0.6, ease: [0.22, 1, 0.36, 1] },
      },
   }

   const progress = seconds / REDIRECT_SECONDS

   return (
      <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-5 py-16 text-foreground">
         {/* Minimal decoration: faded grid + soft primary glow. */}
         <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
               backgroundImage:
                  'linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
               backgroundSize: '56px 56px',
               maskImage: 'radial-gradient(ellipse 65% 55% at 50% 45%, #000 5%, transparent 75%)',
               WebkitMaskImage:
                  'radial-gradient(ellipse 65% 55% at 50% 45%, #000 5%, transparent 75%)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.42 }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
         />
         <motion.div
            aria-hidden
            className="pointer-events-none absolute -top-32 left-1/2 size-[26rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.3, ease: 'easeOut' }}
         />

         <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="relative flex w-full max-w-md flex-col items-center"
         >
            <motion.span variants={item} className="text-sm font-semibold tracking-[-.04em]">
               crosscart<span className="text-primary">.</span>
            </motion.span>

            <motion.section
               variants={item}
               className="mt-7 w-full border border-border bg-card/70 p-7 backdrop-blur-sm sm:p-9"
            >
               <p className="text-[10px] font-semibold tracking-[.22em] text-primary">
                  {t('nf.badge')}
               </p>

               <h1 className="mt-6 text-[clamp(3.4rem,15vw,5.6rem)] font-medium leading-[.85] tracking-[-.09em]">
                  404
                  <span className="sr-only"> — {t('nf.title')}</span>
               </h1>

               <p className="mt-4 text-sm font-medium tracking-[-.02em]">{t('nf.title')}</p>
               <p className="mt-2 text-xs leading-6 text-muted-foreground">{t('nf.body')}</p>

               <Link
                  href="/"
                  className="group mt-7 inline-flex cursor-pointer items-center gap-3 bg-primary px-4 py-3 text-xs font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
               >
                  <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
                  {t('nf.back')}
               </Link>

               <div className="mt-8 border-t border-border pt-5" role="status" aria-live="polite">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                     <span>
                        {seconds === 0
                           ? t('nf.redirectingNow')
                           : t(seconds === 1 ? 'nf.redirectingOne' : 'nf.redirecting', { seconds })}
                     </span>
                     <span className="font-mono tabular-nums text-foreground">{seconds}s</span>
                  </div>

                  <div className="mt-3 h-px w-full bg-border">
                     <motion.div
                        className="h-px origin-left bg-primary"
                        initial={{ scaleX: 1 }}
                        animate={{ scaleX: progress }}
                        transition={{ duration: 1, ease: 'linear' }}
                     />
                  </div>
               </div>
            </motion.section>

            <motion.div
               variants={item}
               className="mt-6 flex items-center gap-2 text-[10px] tracking-[.2em] text-muted-foreground"
            >
               <span>{lang}</span>
               <span className="opacity-40">/</span>
               <span>{isDark ? t('nav.theme.dark') : t('nav.theme.light')}</span>
            </motion.div>
         </motion.div>
      </main>
   )
}

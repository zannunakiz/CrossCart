"use client"

import { motion, useReducedMotion, type Variants } from "framer-motion"
import { ArrowUpRight, Clock, ShoppingCart, Store } from "lucide-react"
import Link from "next/link"

import { T } from "@/components/t"
import type { TranslationKey } from "@/lib/i18n"

type NavItem = {
   titleKey: TranslationKey
   subtitleKey: TranslationKey
   href: string
   icon: React.ComponentType<{ className?: string }>
   /** Parked modules render as a dimmed, unclickable card with a "Coming soon" badge. */
   comingSoon?: boolean
}

/**
 * Order matters: the live module (Quick Store) is the primary card on the left,
 * the parked module (Modern POS) sits on the right.
 */
const primaryNav: NavItem[] = [
   {
      titleKey: "dash.app.quickstore.title",
      subtitleKey: "dash.app.quickstore.subtitle",
      href: "/quickstore",
      icon: Store,
   },
   {
      titleKey: "dash.app.pos.title",
      subtitleKey: "dash.app.pos.subtitle",
      href: "/pos",
      icon: ShoppingCart,
      comingSoon: true,
   },
]

export function PrimaryNav() {
   const shouldReduceMotion = useReducedMotion()

   const container: Variants = {
      hidden: {},
      show: {
         transition: {
            staggerChildren: shouldReduceMotion ? 0 : 0.08,
            delayChildren: shouldReduceMotion ? 0 : 0.05,
         },
      },
   }

   const item: Variants = {
      hidden: { opacity: 0, y: shouldReduceMotion ? 0 : 14 },
      show: {
         opacity: 1,
         y: 0,
         transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
      },
   }

   const cardClass =
      "group relative flex min-h-[220px] flex-col justify-between border border-border bg-card p-6 transition-colors sm:min-h-[260px] sm:p-8"

   return (
      <motion.div
         variants={container}
         initial="hidden"
         animate="show"
         className="grid gap-4 sm:grid-cols-2"
      >
         {primaryNav.map((nav) => {
            const Icon = nav.icon

            /* ── Parked module: dimmed, no link, no hover affordance ─────────── */
            if (nav.comingSoon) {
               return (
                  <motion.div key={nav.href} variants={item}>
                     <div
                        aria-disabled="true"
                        className={`${cardClass} cursor-not-allowed select-none border-dashed opacity-50 saturate-0`}
                     >
                        <div className="flex items-start justify-between">
                           <span className="grid size-12 place-items-center border border-border bg-background">
                              <Icon className="size-5 text-muted-foreground" />
                           </span>
                           <span className="flex items-center gap-1.5 text-2xs font-medium text-muted-foreground">
                              <Clock className="size-3" />
                              <T k="dash.badge.comingSoon" />
                           </span>
                        </div>

                        <div>
                           <div className="flex items-end justify-between gap-4">
                              <h2 className="text-xl font-semibold tracking-tight text-muted-foreground sm:text-2xl">
                                 <T k={nav.titleKey} />
                              </h2>
                              <span className="border border-border px-2 py-1 text-3xs font-semibold uppercase tracking-[.18em] text-muted-foreground">
                                 <T k="dash.badge.comingSoon" />
                              </span>
                           </div>
                           <p className="mt-1.5 text-sm text-muted-foreground/80">
                              <T k={nav.subtitleKey} />
                           </p>
                        </div>
                     </div>
                  </motion.div>
               )
            }

            /* ── Live module ────────────────────────────────────────────────── */
            return (
               <motion.div key={nav.href} variants={item}>
                  <Link
                     href={nav.href}
                     className={`${cardClass} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 hover:border-foreground`}
                  >
                     <div className="flex items-start justify-between">
                        <span className="grid size-12 place-items-center border border-border bg-background transition-colors group-hover:border-primary">
                           <Icon className="size-5 text-primary" />
                        </span>
                     </div>

                     <div>
                        <div className="flex items-end justify-between gap-4">
                           <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                              <T k={nav.titleKey} />
                           </h2>
                           <ArrowUpRight className="size-5 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                        </div>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                           <T k={nav.subtitleKey} />
                        </p>
                     </div>
                  </Link>
               </motion.div>
            )
         })}
      </motion.div>
   )
}

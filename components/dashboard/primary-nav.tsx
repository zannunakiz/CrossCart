"use client"

import { motion, useReducedMotion, type Variants } from "framer-motion"
import { ArrowUpRight, ShoppingCart, Store } from "lucide-react"
import Link from "next/link"

import { T } from "@/components/t"
import type { TranslationKey } from "@/lib/i18n"

type NavItem = {
   titleKey: TranslationKey
   subtitleKey: TranslationKey
   href: string
   icon: React.ComponentType<{ className?: string }>
   badgeKey?: TranslationKey
}

const primaryNav: NavItem[] = [
   {
      titleKey: "dash.app.pos.title",
      subtitleKey: "dash.app.pos.subtitle",
      href: "/pos",
      icon: ShoppingCart,
      badgeKey: "dash.badge.live",
   },
   {
      titleKey: "dash.app.quickstore.title",
      subtitleKey: "dash.app.quickstore.subtitle",
      href: "/quickstore",
      icon: Store,
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

   return (
      <motion.div
         variants={container}
         initial="hidden"
         animate="show"
         className="grid gap-4 sm:grid-cols-2"
      >
         {primaryNav.map((nav) => {
            const Icon = nav.icon
            return (
               <motion.div key={nav.href} variants={item}>
                  <Link
                     href={nav.href}
                     className="group relative flex min-h-[220px] flex-col justify-between border border-border bg-card p-6 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 hover:border-foreground sm:min-h-[260px] sm:p-8"
                  >
                     <div className="flex items-start justify-between">
                        <span className="grid size-12 place-items-center border border-border bg-background transition-colors group-hover:border-primary">
                           <Icon className="size-5 text-primary" />
                        </span>
                        {nav.badgeKey && (
                           <span className="flex items-center gap-1.5 text-2xs font-medium text-muted-foreground">
                              <span className="size-1.5 rounded-full bg-emerald-500" />
                              <T k={nav.badgeKey} />
                           </span>
                        )}
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
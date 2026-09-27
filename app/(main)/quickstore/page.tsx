"use client"

import { motion, type Variants } from "framer-motion"
import { Plus } from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { CreateStoreDialog } from "@/components/quickstore/create-store-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Store as StoreType } from "@/lib/db/schema"
import { useTranslation } from "@/lib/i18n"

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" },
  },
}

export default function QuickStorePage() {
  const { lang, t } = useTranslation()
  const [stores, setStores] = useState<StoreType[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)

  const fetchStores = useCallback(async () => {
    try {
      const res = await fetch("/api/quickstore/stores")
      if (!res.ok) throw new Error("Failed to fetch stores")
      const data = await res.json()
      setStores(data)
    } catch {
      toast.error(t("qs.loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStores()
  }, [fetchStores])

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-light tracking-tight sm:text-3xl">
            <span className="text-primary">Quick</span>{" "}
            <span className="text-foreground">Store</span>
          </h1>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {lang === "ID" ? "Kelola toko mikro Anda" : "Manage your micro stores"}
          </p>
        </div>
        <Button
          id="create-store-btn"
          variant="outline"
          size="sm"
          onClick={() => setDialogOpen(true)}
          className="shrink-0 gap-1.5 self-start sm:self-auto"
        >
          <Plus className="size-3.5" />
          {t("qs.newStore")}
        </Button>
      </motion.div>

      {/* Store grid area */}
      {loading ? (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <motion.div
              key={i}
              variants={itemVariants}
              className="flex flex-col justify-between border border-border bg-card p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {/* Row 1: Title */}
                  <div className="mt-0.5 h-3.5 w-3/4 animate-pulse rounded bg-muted" />
                  {/* Row 2: Description */}
                  <div className="mt-2.5 h-2 w-11/12 animate-pulse rounded bg-muted" />
                </div>
                {/* Badge skeleton */}
                <div className="h-5 w-17 shrink-0 animate-pulse rounded-full bg-muted" />
              </div>

              {/* Row 3: Footer date + link */}
              <div className="mt-4 flex items-center justify-between">
                <div className="h-2 w-24 animate-pulse rounded bg-muted" />
                <div className="h-2 w-16 animate-pulse rounded bg-muted" />
              </div>
            </motion.div>
          ))}
        </motion.div>
      ) : stores.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 15, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex flex-col items-center justify-center border border-dashed border-border py-20 text-center"
        >
          <p className="text-base font-semibold">{t("qs.empty.title")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("qs.empty.subtitle")}</p>
          <Button
            id="create-store-empty-btn"
            variant="outline"
            onClick={() => setDialogOpen(true)}
            className="mt-5 gap-2"
          >
            <Plus className="size-4" />
            {t("qs.empty.cta")}
          </Button>
        </motion.div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {stores.map((store) => (
            <motion.div key={store.id} variants={itemVariants} className="h-full">
              <Link
                href={`/quickstore/${store.id}`}
                id={`store-card-${store.id}`}
                className="group relative flex h-full flex-col justify-between border border-border bg-card p-5 transition-colors hover:border-foreground"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm font-normal text-foreground"
                      title={store.name}
                    >
                      {store.name}
                    </p>
                    {store.description && (
                      <p
                        className="mt-1 text-2xs text-muted-foreground"
                        title={store.description}
                      >
                        {store.description.length > 24
                          ? `${store.description.slice(0, 24)}...`
                          : store.description}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={store.open ? "default" : "secondary"}
                    className={`shrink-0 text-3xs ${!store.open
                      ? "dark:bg-zinc-800 dark:border-zinc-800 dark:text-zinc-300"
                      : ""
                      }`}
                  >
                    {store.open ? t("qs.open") : t("qs.closed")}
                  </Badge>
                </div>

                <div className="mt-4 flex items-center justify-between gap-4 text-2xs text-muted-foreground">
                  <span className="truncate">
                    {new Date(store.createdAt).toLocaleDateString(
                      lang === "ID" ? "id-ID" : "en-GB",
                      {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      }
                    )}
                  </span>
                  <span className="shrink-0 font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    {t("qs.openLink")}
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}

      <CreateStoreDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(store) => {
          setStores((prev) => [store, ...prev])
          toast.success(t("qs.created", { name: store.name }))
        }}
      />
    </div>
  )
}
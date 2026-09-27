"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Plus, ShoppingBag, Store } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useLanguage } from "@/lib/i18n"

type PosStore = {
  id: string
  name: string
  slug: string
  currency: "IDR" | "USD"
  isOpen: boolean
  description: string | null
}

export function PosHomeClient() {
  const lang = useLanguage()
  const id = lang === "ID"
  const [stores, setStores] = useState<PosStore[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [storeName, setStoreName] = useState("")
  const [storeCurrency, setStoreCurrency] = useState<"IDR" | "USD">("IDR")
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let active = true
    fetch("/api/pos/stores", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => { if (active) setStores(data) })
      .catch(() => toast.error(id ? "Gagal memuat toko." : "Could not load stores."))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id])

  const createStore = async () => {
    if (!storeName.trim()) return
    setCreating(true)
    try {
      const res = await fetch("/api/pos/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: storeName.trim(), currency: storeCurrency }),
      })
      const created = await res.json()
      if (!res.ok) throw new Error(created.error)
      setStores((prev) => [...prev, created])
      setStoreName("")
      setShowCreate(false)
      toast.success(id ? `Toko "${created.name}" dibuat.` : `Store "${created.name}" created.`)
    } catch {
      toast.error(id ? "Gagal membuat toko." : "Could not create store.")
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {id ? "Sistem POS" : "POS System"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {id ? "Pilih atau buat toko untuk memulai." : "Select or create a store to get started."}
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate((v) => !v)}>
          <Plus className="size-4" />
          {id ? "Toko Baru" : "New Store"}
        </Button>
      </header>

      {/* Create store form */}
      <AnimatePresence>
        {showCreate && (
          <motion.section
            key="create"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-xl border bg-card p-4 space-y-3"
          >
            <h2 className="text-sm font-semibold">{id ? "Buat Toko POS" : "Create POS Store"}</h2>
            <div className="flex flex-wrap gap-3">
              <div className="min-w-48 flex-1 space-y-1">
                <Label className="text-xs">{id ? "Nama Toko (maks 20 karakter)" : "Store Name (max 20 chars)"}</Label>
                <Input
                  maxLength={20}
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder={id ? "Mis: Warung Kopi" : "e.g. Coffee Corner"}
                />
              </div>
              <div className="w-32 space-y-1">
                <Label className="text-xs">{id ? "Mata Uang" : "Currency"}</Label>
                <select
                  value={storeCurrency}
                  onChange={(e) => setStoreCurrency(e.target.value as "IDR" | "USD")}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="IDR">IDR</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div className="flex items-end gap-2">
                <Button
                  disabled={!storeName.trim() || creating}
                  onClick={createStore}
                >
                  {creating ? (id ? "Membuat…" : "Creating…") : (id ? "Buat" : "Create")}
                </Button>
                <Button variant="ghost" onClick={() => setShowCreate(false)}>
                  {id ? "Batal" : "Cancel"}
                </Button>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Stores grid */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl border bg-muted" />
          ))}
        </div>
      ) : stores.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center"
        >
          <Store className="size-10 text-muted-foreground/50" />
          <p className="text-sm font-medium">{id ? "Belum ada toko POS" : "No POS stores yet"}</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            {id
              ? "Buat toko POS pertamamu untuk mulai menerima pesanan."
              : "Create your first POS store to start receiving orders."}
          </p>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="size-4" />
            {id ? "Buat Toko" : "Create Store"}
          </Button>
        </motion.div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {stores.map((store) => (
              <motion.div
                key={store.id}
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
              >
                <Link
                  href={`/pos/${store.id}/cashier`}
                  className="group flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50 cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div className="grid size-10 place-items-center rounded-lg bg-primary/10">
                      <ShoppingBag className="size-5 text-primary" />
                    </div>
                    <Badge
                      className={
                        store.isOpen
                          ? "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400 text-[10px]"
                          : "bg-muted text-muted-foreground hover:bg-muted text-[10px]"
                      }
                    >
                      {store.isOpen ? (id ? "Buka" : "Open") : (id ? "Tutup" : "Closed")}
                    </Badge>
                  </div>
                  <div>
                    <p className="font-semibold text-sm group-hover:text-primary transition-colors">
                      {store.name}
                    </p>
                    {store.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                        {store.description}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">{store.currency}</p>
                  </div>
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}

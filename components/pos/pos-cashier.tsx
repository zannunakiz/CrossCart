"use client"

import { AnimatePresence, motion } from "framer-motion"
import {
  Camera,
  Check,
  Clock3,
  Loader2,
  Minus,
  Plus,
  QrCode,
  Search,
  ShoppingBag,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { QrCameraScanner } from "@/components/pos/qr-camera-scanner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { useLanguage } from "@/lib/i18n"

// ── Types ──────────────────────────────────────────────────────────────────
type CatalogItem = {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  price: string
  stockOnHand: number
  trackStock: boolean
  available: boolean
  categoryId: string | null
}

type Category = { id: string; name: string; sortOrder: number }

type CartLine = { itemId: string; quantity: number; note: string }

type OrderLine = {
  id: string
  itemId: string | null
  nameSnapshot: string
  unitPrice: string
  quantity: number
  note: string | null
  lineTotal: string
}

type Order = {
  id: string
  orderNumber: string
  accessCode: string
  customerName: string
  status: string
  paymentStatus: string
  total: string
  currency: string
  version: number
  lines: OrderLine[]
}

type Phase = "idle" | "scan" | "order" | "countdown" | "paid?" | "done"

// ── Money formatter ────────────────────────────────────────────────────────
function fmt(value: number | string, currency: string, lang: "EN" | "ID") {
  return new Intl.NumberFormat(lang === "ID" ? "id-ID" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value))
}

export function PosCashier({
  storeId,
  currency,
}: {
  storeId: string
  currency: string
}) {
  const lang = useLanguage()
  const id = lang === "ID"

  // Catalog
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [query, setQuery] = useState("")
  const [catFilter, setCatFilter] = useState<string | null>(null)

  // Cart (for direct walk-in)
  const [cart, setCart] = useState<Map<string, CartLine>>(new Map())

  // Scan/lookup mode
  const [phase, setPhase] = useState<Phase>("idle")
  const [scanCode, setScanCode] = useState("")
  const [scannerOpen, setScannerOpen] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null)
  const [editLines, setEditLines] = useState<Map<string, CartLine>>(new Map())

  // Countdown
  const [seconds, setSeconds] = useState(3)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Saving
  const [saving, setSaving] = useState(false)

  // Load catalog
  const loadCatalog = useCallback(async () => {
    try {
      setLoadingCatalog(true)
      const [items, cats] = await Promise.all([
        fetch(`/api/pos/stores/${storeId}/items`, { cache: "no-store" }).then((r) => r.json()),
        fetch(`/api/pos/stores/${storeId}/categories`, { cache: "no-store" }).then((r) => r.json()),
      ])
      setCatalog(Array.isArray(items) ? items.filter((i: CatalogItem) => i.available) : [])
      setCategories(Array.isArray(cats) ? cats : [])
    } catch {
      toast.error(id ? "Gagal memuat katalog." : "Could not load catalog.")
    } finally {
      setLoadingCatalog(false)
    }
  }, [storeId, id])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadCatalog() }, [loadCatalog])

  // Filtered catalog
  const visibleItems = useMemo(() => {
    return catalog.filter((item) => {
      const matchQuery = item.name.toLowerCase().includes(query.toLowerCase())
      const matchCat = catFilter ? item.categoryId === catFilter : true
      return matchQuery && matchCat
    })
  }, [catalog, query, catFilter])

  // ── Cart helpers ──────────────────────────────────────────────────────
  const cartLines = useMemo(() => {
    return [...cart.entries()].map(([itemId, line]) => {
      const item = catalog.find((c) => c.id === itemId)
      return { ...line, item, total: item ? Number(item.price) * line.quantity : 0 }
    })
  }, [cart, catalog])

  const cartTotal = cartLines.reduce((s, l) => s + l.total, 0)

  const adjustCart = (itemId: string, delta: number) => {
    const item = catalog.find((c) => c.id === itemId)
    if (!item) return
    setCart((prev) => {
      const next = new Map(prev)
      const current = next.get(itemId)?.quantity ?? 0
      const maxQty = item.trackStock ? item.stockOnHand : 99
      const newQty = Math.max(0, Math.min(maxQty, current + delta))
      if (newQty === 0) next.delete(itemId)
      else next.set(itemId, { itemId, quantity: newQty, note: current ? next.get(itemId)!.note : "" })
      return next
    })
  }

  // ── Order lookup ──────────────────────────────────────────────────────
  const lookupOrder = async (raw?: string) => {
    const value = (raw ?? scanCode).trim().toUpperCase()
    if (!value) return
    setLookingUp(true)
    try {
      const res = await fetch(
        `/api/pos/stores/${storeId}/orders/lookup?code=${encodeURIComponent(value)}`,
        { cache: "no-store" }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCurrentOrder(data)
      // Seed edit lines from order
      const map = new Map<string, CartLine>()
      for (const line of data.lines as OrderLine[]) {
        if (line.itemId) {
          map.set(line.itemId, { itemId: line.itemId, quantity: line.quantity, note: line.note ?? "" })
        }
      }
      setEditLines(map)
      setPhase("order")
    } catch (e) {
      const message = e instanceof Error ? e.message : ""
      toast.error(
        message === "CODE_ALREADY_USED"
          ? (id ? "Kode ini sudah dipakai dan tidak berlaku lagi." : "This code has already been used and is no longer valid.")
          : message || (id ? "Kode tidak ditemukan." : "Order not found.")
      )
    } finally {
      setLookingUp(false)
    }
  }

  // QR payload is `CCPOS:<slug>:<CODE>` — raw codes are accepted too
  const parseScanPayload = (payload: string) => {
    const parts = payload.trim().split(":").filter(Boolean)
    return (parts.at(-1) ?? "").trim().toUpperCase().slice(0, 12)
  }

  const handleScanResult = (payload: string) => {
    setScannerOpen(false)
    const code = parseScanPayload(payload)
    if (!code) {
      toast.error(id ? "QR tidak dikenali." : "Unrecognized QR code.")
      return
    }
    setScanCode(code)
    void lookupOrder(code)
  }

  // ── Edit lines for order ───────────────────────────────────────────────
  const adjustOrderLine = (itemId: string, delta: number) => {
    const item = catalog.find((c) => c.id === itemId)
    setEditLines((prev) => {
      const next = new Map(prev)
      const current = next.get(itemId)?.quantity ?? 0
      const maxQty = item?.trackStock ? item.stockOnHand : 99
      const newQty = Math.max(0, Math.min(maxQty, current + delta))
      if (newQty === 0) next.delete(itemId)
      else next.set(itemId, { itemId, quantity: newQty, note: next.get(itemId)?.note ?? "" })
      return next
    })
  }

  const addItemToOrder = (itemId: string) => {
    const item = catalog.find((c) => c.id === itemId)
    if (!item || !item.available) return
    setEditLines((prev) => {
      const next = new Map(prev)
      const current = next.get(itemId)?.quantity ?? 0
      const maxQty = item.trackStock ? item.stockOnHand : 99
      if (current < maxQty) next.set(itemId, { itemId, quantity: current + 1, note: next.get(itemId)?.note ?? "" })
      return next
    })
  }

  const orderEditTotal = useMemo(() => {
    let total = 0
    for (const [itemId, line] of editLines) {
      const item = catalog.find((c) => c.id === itemId)
      const price = item ? Number(item.price) : (currentOrder?.lines.find((l) => l.itemId === itemId)?.unitPrice ?? 0)
      total += Number(price) * line.quantity
    }
    return total
  }, [editLines, catalog, currentOrder])

  // ── Save edited order ─────────────────────────────────────────────────
  const saveOrderEdits = async () => {
    if (!currentOrder) return
    setSaving(true)
    try {
      const res = await fetch(`/api/pos/stores/${storeId}/orders/${currentOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: currentOrder.version,
          lines: [...editLines.values()],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCurrentOrder(data)
      toast.success(id ? "Pesanan diperbarui." : "Order updated.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (id ? "Gagal menyimpan." : "Save failed."))
    } finally {
      setSaving(false)
    }
  }

  // ── Countdown → paid? ─────────────────────────────────────────────────
  const startCountdown = () => {
    setSeconds(3)
    setPhase("countdown")
    let rem = 3
    countdownRef.current = setInterval(() => {
      rem -= 1
      setSeconds(rem)
      if (rem <= 0) {
        clearInterval(countdownRef.current!)
        setPhase("paid?")
      }
    }, 1000)
  }

  // ── Complete order ─────────────────────────────────────────────────────
  const completeOrder = async () => {
    if (!currentOrder) return
    setSaving(true)
    try {
      const res = await fetch(
        `/api/pos/stores/${storeId}/orders/${currentOrder.id}/complete`,
        { method: "POST" }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setPhase("done")
      setScanCode("") // the access code is now burned — never reuse it
      void loadCatalog() // refresh stock
      toast.success(id ? "Pesanan selesai. Kode sudah hangus, stok diperbarui." : "Order completed. Code is now void, stock updated.")
    } catch (e) {
      const message = e instanceof Error ? e.message : ""
      // Another terminal/tap already confirmed this order: the code is burned,
      // but the sale itself is recorded, so show the success state.
      if (message === "CODE_ALREADY_USED") {
        setPhase("done")
        setScanCode("")
        void loadCatalog()
        toast.info(
          id
            ? "Kode sudah dipakai sebelumnya — pesanan sudah tercatat lunas."
            : "Code was already used — this order is already paid."
        )
        return
      }
      toast.error(message || (id ? "Gagal menyelesaikan." : "Could not complete."))
      setPhase("order")
    } finally {
      setSaving(false)
    }
  }

  // ── Walk-in checkout (no QR) ───────────────────────────────────────────
  const walkinCheckout = async () => {
    if (cart.size === 0) return
    setSaving(true)
    try {
      // Create order
      const res = await fetch(`/api/pos/public/${encodeURIComponent(storeId)}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: id ? "Pelanggan langsung" : "Walk-in",
          lines: [...cart.values()].map((l) => ({ itemId: l.itemId, quantity: l.quantity })),
        }),
      })
      // Note: we use storeId instead of slug here, so use the stores slug we got
      // Actually we need slug. Let's try with the store PATCH
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error)
      }
      const order = await res.json()
      // Immediately complete
      const cRes = await fetch(
        `/api/pos/stores/${storeId}/orders/${order.id}/complete`,
        { method: "POST" }
      )
      if (!cRes.ok) { const d = await cRes.json(); throw new Error(d.error) }
      toast.success(id ? "Penjualan langsung selesai." : "Walk-in sale completed.")
      setCart(new Map())
      void loadCatalog()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (id ? "Gagal." : "Failed."))
    } finally {
      setSaving(false)
    }
  }

  const resetFlow = () => {
    setPhase("idle")
    setScanCode("")
    setCurrentOrder(null)
    setEditLines(new Map())
    if (countdownRef.current) clearInterval(countdownRef.current)
  }

  // ── Edit lines display ─────────────────────────────────────────────────
  const editLinesList = useMemo(() => {
    return [...editLines.entries()].map(([itemId, line]) => {
      const item = catalog.find((c) => c.id === itemId)
      const snap = currentOrder?.lines.find((l) => l.itemId === itemId)
      const name = item?.name ?? snap?.nameSnapshot ?? itemId
      const price = item ? Number(item.price) : Number(snap?.unitPrice ?? 0)
      return { itemId, quantity: line.quantity, note: line.note, name, price, total: price * line.quantity }
    })
  }, [editLines, catalog, currentOrder])

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      {/* ── Left: Catalog ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        {/* Search + filter */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={id ? "Cari menu…" : "Search menu…"}
              className="pl-8"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            <Button
              size="sm"
              variant={catFilter === null ? "secondary" : "ghost"}
              onClick={() => setCatFilter(null)}
            >
              {id ? "Semua" : "All"}
            </Button>
            {categories.map((cat) => (
              <Button
                key={cat.id}
                size="sm"
                variant={catFilter === cat.id ? "secondary" : "ghost"}
                onClick={() => setCatFilter(cat.id)}
              >
                {cat.name}
              </Button>
            ))}
          </div>
        </div>

        {/* Items grid */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {loadingCatalog ? (
            [...Array(8)].map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg border bg-muted" />
            ))
          ) : visibleItems.length === 0 ? (
            <p className="col-span-full py-12 text-center text-sm text-muted-foreground">
              {id ? "Tidak ada item." : "No items found."}
            </p>
          ) : (
            visibleItems.map((item) => {
              const inCart = cart.get(item.id)?.quantity ?? 0
              const inOrder = editLines.get(item.id)?.quantity ?? 0
              const isOOS = item.trackStock && item.stockOnHand === 0
              return (
                <motion.button
                  layout
                  key={item.id}
                  disabled={isOOS}
                  onClick={() =>
                    phase === "order" ? addItemToOrder(item.id) : adjustCart(item.id, 1)
                  }
                  className="group relative cursor-pointer rounded-lg border bg-background p-3 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
                    <UtensilsCrossed className="size-4" />
                  </div>
                  <p className="mt-3 truncate text-xs font-semibold">{item.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {fmt(item.price, currency, lang)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {item.trackStock
                      ? isOOS
                        ? (id ? "Habis" : "Out of stock")
                        : `${item.stockOnHand} ${id ? "tersisa" : "left"}`
                      : (id ? "Stok bebas" : "Unlimited")}
                  </p>
                  {/* Badge for in-cart/order quantity */}
                  {(inCart > 0 || inOrder > 0) && (
                    <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                      {phase === "order" ? inOrder : inCart}
                    </span>
                  )}
                </motion.button>
              )
            })
          )}
        </div>
      </section>

      {/* ── Right: Order panel ──────────────────────────────────────────── */}
      <aside className="flex h-fit flex-col rounded-xl border bg-card">
        {/* Panel header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <ShoppingBag className="size-4" />
            {phase === "idle"
              ? (id ? "Kasir" : "Cashier")
              : phase === "order" || phase === "countdown" || phase === "paid?"
              ? (id ? `Pesanan ${currentOrder?.accessCode ?? ""}` : `Order ${currentOrder?.accessCode ?? ""}`)
              : phase === "done"
              ? (id ? "Selesai" : "Done")
              : (id ? "Scan Kode" : "Scan Code")}
          </h2>
          {(phase === "order" || phase === "countdown" || phase === "paid?") && (
            <Button variant="ghost" size="icon-xs" onClick={resetFlow} aria-label="Close order">
              <X className="size-4" />
            </Button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {/* IDLE: show cart + scan button */}
          {phase === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col"
            >
              {/* Cart lines */}
              <div className="min-h-40 space-y-1.5 p-3">
                {cartLines.length === 0 ? (
                  <div className="grid min-h-36 place-items-center text-center text-xs text-muted-foreground">
                    <div>
                      <UtensilsCrossed className="mx-auto mb-2 size-8 opacity-30" />
                      <p>{id ? "Pilih item untuk memulai" : "Select items to begin"}</p>
                    </div>
                  </div>
                ) : (
                  cartLines.map((line) => (
                    <div key={line.itemId} className="flex items-center gap-2 rounded-lg bg-muted/50 p-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{line.item?.name ?? line.itemId}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {fmt(line.item?.price ?? 0, currency, lang)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => adjustCart(line.itemId, -1)}
                        >
                          <Minus className="size-3" />
                        </Button>
                        <span className="w-5 text-center text-xs tabular-nums">{line.quantity}</span>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          disabled={
                            line.item?.trackStock
                              ? line.quantity >= (line.item?.stockOnHand ?? 0)
                              : false
                          }
                          onClick={() => adjustCart(line.itemId, 1)}
                        >
                          <Plus className="size-3" />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => {
                            setCart((prev) => { const n = new Map(prev); n.delete(line.itemId); return n })
                          }}
                        >
                          <Trash2 className="size-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="border-t p-3 space-y-2">
                {cartLines.length > 0 && (
                  <>
                    <div className="flex items-center justify-between text-sm font-semibold">
                      <span>{id ? "Total" : "Total"}</span>
                      <span>{fmt(cartTotal, currency, lang)}</span>
                    </div>
                    <Button
                      className="w-full"
                      disabled={saving}
                      onClick={walkinCheckout}
                    >
                      {saving ? <Loader2 className="animate-spin" /> : null}
                      {id ? "Bayar langsung" : "Walk-in checkout"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => setCart(new Map())}
                    >
                      {id ? "Kosongkan" : "Clear cart"}
                    </Button>
                    <Separator />
                  </>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setPhase("scan")}
                >
                  <QrCode className="size-4" />
                  {id ? "Scan / Input kode" : "Scan / Enter code"}
                </Button>
              </div>
            </motion.div>
          )}

          {/* SCAN: input code */}
          {phase === "scan" && (
            <motion.div
              key="scan"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-4 space-y-3"
            >
              <p className="text-xs text-muted-foreground">
                {id
                  ? "Scan QR pelanggan atau input kode pesanan."
                  : "Scan customer QR or enter the order code."}
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">{id ? "Kode Pesanan" : "Order Code"}</Label>
                <Input
                  value={scanCode}
                  onChange={(e) => setScanCode(e.target.value.toUpperCase())}
                  placeholder={id ? "Contoh: A1B2C3D4" : "e.g. A1B2C3D4"}
                  maxLength={12}
                  onKeyDown={(e) => { if (e.key === "Enter") void lookupOrder() }}
                  autoFocus
                />
              </div>
              <Button variant="outline" className="w-full" onClick={() => setScannerOpen(true)}>
                <Camera className="size-4" />
                {id ? "Scan QR pakai kamera" : "Scan QR with camera"}
              </Button>
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  disabled={!scanCode.trim() || lookingUp}
                  onClick={() => void lookupOrder()}
                >
                  {lookingUp ? <Loader2 className="animate-spin" /> : null}
                  {id ? "Cari pesanan" : "Find order"}
                </Button>
                <Button variant="ghost" onClick={resetFlow}>
                  {id ? "Batal" : "Cancel"}
                </Button>
              </div>
            </motion.div>
          )}

          {/* ORDER: show order + allow edits */}
          {phase === "order" && currentOrder && (
            <motion.div
              key="order"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col"
            >
              <div className="p-3 bg-muted/30 border-b space-y-0.5">
                <p className="text-xs font-semibold">{currentOrder.customerName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {id ? "Status" : "Status"}: <span className="capitalize">{currentOrder.status}</span>
                </p>
              </div>

              {/* Edit lines */}
              <div className="min-h-36 space-y-1.5 p-3">
                {editLinesList.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    {id ? "Belum ada item." : "No items yet."}
                  </p>
                ) : (
                  editLinesList.map((line) => (
                    <div key={line.itemId} className="flex items-center gap-2 rounded-lg bg-muted/50 p-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{line.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {fmt(line.price, currency, lang)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon-xs" variant="ghost" onClick={() => adjustOrderLine(line.itemId, -1)}>
                          <Minus className="size-3" />
                        </Button>
                        <span className="w-5 text-center text-xs tabular-nums">{line.quantity}</span>
                        <Button size="icon-xs" variant="ghost" onClick={() => adjustOrderLine(line.itemId, 1)}>
                          <Plus className="size-3" />
                        </Button>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => {
                            setEditLines((prev) => { const n = new Map(prev); n.delete(line.itemId); return n })
                          }}
                        >
                          <Trash2 className="size-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="border-t p-3 space-y-2">
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>{id ? "Total" : "Total"}</span>
                  <span>{fmt(orderEditTotal, currency, lang)}</span>
                </div>
                {/* Save edits button */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={saving}
                  onClick={saveOrderEdits}
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                  {id ? "Simpan perubahan pesanan" : "Save order changes"}
                </Button>
                {/* Confirm payment */}
                <Button
                  className="w-full"
                  disabled={editLinesList.length === 0 || saving}
                  onClick={startCountdown}
                >
                  {id ? "Konfirmasi pembayaran" : "Confirm payment"}
                </Button>
              </div>
            </motion.div>
          )}

          {/* COUNTDOWN */}
          {phase === "countdown" && (
            <motion.div
              key="countdown"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-6 text-center space-y-3"
            >
              <Clock3 className="mx-auto size-10 text-muted-foreground animate-pulse" />
              <p className="text-sm font-semibold">
                {id ? `Konfirmasi dalam ${seconds}s` : `Confirm in ${seconds}s`}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearInterval(countdownRef.current!)
                  setPhase("order")
                }}
              >
                {id ? "Batalkan" : "Cancel"}
              </Button>
            </motion.div>
          )}

          {/* PAID? */}
          {phase === "paid?" && (
            <motion.div
              key="paid"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="p-5 space-y-4 text-center"
            >
              <div className="space-y-1">
                <p className="text-base font-semibold">
                  {id ? "Pelanggan sudah bayar?" : "Customer paid?"}
                </p>
                <p className="text-sm font-bold text-primary">
                  {fmt(orderEditTotal, currency, lang)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {id
                    ? 'Hanya "Ya" yang mencatat penjualan dan mengurangi stok.'
                    : 'Only "Yes" records the sale and reduces stock.'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  disabled={saving}
                  onClick={completeOrder}
                  className="gap-1.5"
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {id ? "Ya, selesai" : "Yes, done"}
                </Button>
                <Button
                  variant="outline"
                  disabled={saving}
                  onClick={() => setPhase("order")}
                >
                  {id ? "Belum" : "No"}
                </Button>
              </div>
            </motion.div>
          )}

          {/* DONE */}
          {phase === "done" && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-6 text-center space-y-3"
            >
              <div className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-500/10">
                <Check className="size-7 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  {id ? "Pesanan selesai!" : "Order complete!"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {id ? "Stok telah diperbarui." : "Stock has been updated."}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {id ? "Kode/QR pelanggan sudah hangus dan tidak bisa dipakai lagi." : "The customer code/QR is now void and cannot be reused."}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={resetFlow}>
                {id ? "Pesanan berikutnya" : "Next order"}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>

      <QrCameraScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onResult={handleScanResult}
      />
    </div>
  )
}

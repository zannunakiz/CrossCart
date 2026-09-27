"use client"

import { Loader2, Receipt } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/lib/i18n"

type OrderLine = {
  id: string
  nameSnapshot: string
  unitPrice: string
  quantity: number
  lineTotal: string
}

type Order = {
  id: string
  orderNumber: string
  customerName: string
  status: string
  paymentStatus: string
  total: string
  currency: string
  createdAt: string
  paidAt: string | null
  lines: OrderLine[]
}

function fmt(v: string | number, currency: string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(v))
}

export function PosOrders({ storeId }: { storeId: string }) {
  const lang = useLanguage()
  const id = lang === "ID"
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [cursor, setCursor] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const load = useCallback(async (c?: string | null) => {
    try {
      const isLoadMore = !!c
      if (isLoadMore) setLoadingMore(true)
      else setLoading(true)

      const url = new URL(`/api/pos/stores/${storeId}/orders`, window.location.origin)
      url.searchParams.set("limit", "20")
      if (c) url.searchParams.set("cursor", c)

      const res = await fetch(url.toString(), { cache: "no-store" })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error)

      setOrders((prev) => (isLoadMore ? [...prev, ...data.data] : data.data))
      setNextCursor(data.nextCursor)
    } catch {
      toast.error(id ? "Gagal memuat pesanan." : "Could not load orders.")
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [storeId, id])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">{id ? "Riwayat Pesanan" : "Order History"}</h2>
          <p className="text-xs text-muted-foreground">{id ? "Daftar semua pesanan masuk." : "List of all incoming orders."}</p>
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : orders.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Receipt className="mx-auto mb-2 size-8 opacity-30" />
            <p className="text-sm">{id ? "Belum ada pesanan." : "No orders yet."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="px-4 py-3 text-left font-medium">No.</th>
                  <th className="px-4 py-3 text-left font-medium">{id ? "Pelanggan" : "Customer"}</th>
                  <th className="px-4 py-3 text-left font-medium">{id ? "Status" : "Status"}</th>
                  <th className="px-4 py-3 text-left font-medium">Total</th>
                  <th className="px-4 py-3 text-left font-medium">{id ? "Waktu" : "Time"}</th>
                  <th className="px-4 py-3 text-left font-medium">Item</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b last:border-0 hover:bg-muted/30 align-top">
                    <td className="px-4 py-3 font-mono text-xs">{o.orderNumber}</td>
                    <td className="px-4 py-3 font-medium">{o.customerName}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <Badge className="text-3xs bg-muted text-muted-foreground hover:bg-muted capitalize">
                          {o.status}
                        </Badge>
                        <Badge className={`text-3xs hover:bg-inherit capitalize ${o.paymentStatus === 'paid' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                          {o.paymentStatus.replace("_", " ")}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium tabular-nums">{fmt(o.total, o.currency)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(o.createdAt).toLocaleString(lang === "ID" ? "id-ID" : "en-US", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <ul className="space-y-0.5">
                        {o.lines.map(l => (
                          <li key={l.id}><span className="font-semibold">{l.quantity}×</span> {l.nameSnapshot}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {nextCursor && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" size="sm" disabled={loadingMore} onClick={() => load(nextCursor)}>
            {loadingMore ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {id ? "Muat Lebih Banyak" : "Load More"}
          </Button>
        </div>
      )}
    </div>
  )
}

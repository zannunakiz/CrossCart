"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { Plus, Store, ToggleLeft, ToggleRight } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CreateStoreDialog } from "@/components/quickstore/create-store-dialog"
import type { Store as StoreType } from "@/lib/db/schema"

export default function QuickStorePage() {
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
      toast.error("Failed to load stores")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStores()
  }, [fetchStores])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quick Store</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your micro-stores — items, members, and payments.
          </p>
        </div>
        <Button
          id="create-store-btn"
          onClick={() => setDialogOpen(true)}
          className="shrink-0 gap-2"
        >
          <Plus className="size-4" />
          New Store
        </Button>
      </div>

      {/* Store grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse border border-border bg-muted/40"
            />
          ))}
        </div>
      ) : stores.length === 0 ? (
        <div className="flex flex-col items-center justify-center border border-dashed border-border bg-card py-20 text-center">
          <span className="mb-4 grid size-14 place-items-center bg-secondary text-primary">
            <Store className="size-7" />
          </span>
          <p className="text-base font-semibold">No stores yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first store to start selling.
          </p>
          <Button
            id="create-store-empty-btn"
            onClick={() => setDialogOpen(true)}
            className="mt-5 gap-2"
          >
            <Plus className="size-4" />
            Create Store
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((store) => (
            <Link
              key={store.id}
              href={`/quickstore/${store.id}`}
              id={`store-card-${store.id}`}
              className="group relative flex flex-col justify-between border border-border bg-card p-5 transition-colors hover:border-foreground"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{store.name}</p>
                  {store.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {store.description}
                    </p>
                  )}
                </div>
                <Badge
                  variant={store.open ? "default" : "secondary"}
                  className="shrink-0 gap-1 text-[10px]"
                >
                  {store.open ? (
                    <ToggleRight className="size-3" />
                  ) : (
                    <ToggleLeft className="size-3" />
                  )}
                  {store.open ? "Open" : "Closed"}
                </Badge>
              </div>

              {store.paymentQr && (
                <div className="mt-3 h-16 w-16 overflow-hidden border border-border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={store.paymentQr}
                    alt="Payment QR"
                    className="h-full w-full object-cover"
                  />
                </div>
              )}

              <div className="mt-4 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>
                  {new Date(store.createdAt).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <span className="font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  Open →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <CreateStoreDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(store) => {
          setStores((prev) => [store, ...prev])
          toast.success(`Store "${store.name}" created!`)
        }}
      />
    </div>
  )
}

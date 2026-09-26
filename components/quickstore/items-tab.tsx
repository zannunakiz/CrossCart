"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Package2, Pencil, Plus, Star, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ItemDialog } from "@/components/quickstore/item-dialog"
import { hasPermission } from "@/lib/quickstore/permissions"
import type { StoreItem, StoreRole } from "@/lib/db/schema"

interface Props {
  storeId: string
  role: StoreRole
}

export function ItemsTab({ storeId, role }: Props) {
  const [items, setItems] = useState<StoreItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<StoreItem | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const canManage = hasPermission(role, "item:create")

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(`/api/quickstore/stores/${storeId}/items`)
      if (!res.ok) throw new Error()
      setItems(await res.json())
    } catch {
      toast.error("Failed to load items")
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchItems()
  }, [fetchItems])

  const handleDelete = async (item: StoreItem) => {
    if (deletingId) return
    const confirmed = window.confirm(`Delete "${item.name}"?`)
    if (!confirmed) return

    setDeletingId(item.id)
    try {
      const res = await fetch(`/api/quickstore/stores/${storeId}/items/${item.id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setItems((prev) => prev.filter((i) => i.id !== item.id))
      toast.success(`"${item.name}" deleted`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed")
    } finally {
      setDeletingId(null)
    }
  }

  const openEdit = (item: StoreItem) => {
    setEditingItem(item)
    setDialogOpen(true)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {items.length} item{items.length !== 1 ? "s" : ""}
        </p>
        {canManage && (
          <Button
            id="add-item-btn"
            size="sm"
            className="gap-2"
            onClick={() => { setEditingItem(null); setDialogOpen(true) }}
          >
            <Plus className="size-4" />
            Add Item
          </Button>
        )}
      </div>

      {/* Empty state */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center border border-dashed border-border bg-card py-16 text-center">
          <Package2 className="mb-3 size-10 text-muted-foreground/50" />
          <p className="font-semibold">No items yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canManage ? "Add your first item to get started." : "No items have been added."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.id}
              id={`item-card-${item.id}`}
              className="relative border border-border bg-card p-4 transition-colors hover:border-foreground"
            >
              {/* Highlight badge */}
              {item.highlight && (
                <span className="absolute right-3 top-3">
                  <Star className="size-3.5 fill-amber-400 text-amber-400" />
                </span>
              )}

              <div className="space-y-1 pr-5">
                <p className="truncate font-semibold text-foreground">{item.name}</p>
                {item.description && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-primary">
                  {item.currency === "IDR"
                    ? `Rp ${Number(item.price).toLocaleString("id-ID")}`
                    : `$${Number(item.price).toFixed(2)}`}
                </span>
                {item.discountPercent > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    -{item.discountPercent}%
                  </Badge>
                )}
                <Badge
                  variant={item.available ? "default" : "secondary"}
                  className="text-[10px]"
                >
                  {item.available ? "Available" : "Unavailable"}
                </Badge>
              </div>

              <div className="mt-2 text-[11px] text-muted-foreground">
                {item.stocks != null ? `${item.stocks} in stock` : "Unlimited stock"} ·{" "}
                {item.purchasedAmount} sold
              </div>

              {canManage && (
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    id={`edit-item-${item.id}`}
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => openEdit(item)}
                  >
                    <Pencil className="size-3" />
                    Edit
                  </Button>
                  <Button
                    id={`delete-item-${item.id}`}
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(item)}
                    disabled={deletingId === item.id}
                  >
                    {deletingId === item.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Trash2 className="size-3" />
                    )}
                    Delete
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        storeId={storeId}
        item={editingItem}
        onSaved={(saved) => {
          setItems((prev) => {
            const idx = prev.findIndex((i) => i.id === saved.id)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = saved
              return next
            }
            return [saved, ...prev]
          })
          toast.success(editingItem ? "Item updated" : `"${saved.name}" added`)
        }}
      />
    </div>
  )
}

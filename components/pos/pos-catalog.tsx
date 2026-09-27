"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Edit2, ImagePlus, Loader2, Package, Plus, Search, Trash2, UploadCloud } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useLanguage } from "@/lib/i18n"

type Item = {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  price: string
  available: boolean
  trackStock: boolean
  stockOnHand: number
  lowStockAt: number
  categoryId: string | null
  sku: string | null
}

type Category = { id: string; name: string }

function fmt(v: string | number, currency: string) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(v))
}

export function PosCatalog({
  storeId,
  currency,
  canWrite,
}: {
  storeId: string
  currency: string
  canWrite: boolean
}) {
  const lang = useLanguage()
  const id = lang === "ID"

  const [items, setItems] = useState<Item[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [catFilter, setCatFilter] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Item | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Form state
  const [form, setForm] = useState<{
    name: string
    description: string
    price: string
    available: boolean
    trackStock: boolean
    stockOnHand: string
    sku: string
    categoryId: string
    imageUrl: string | null
  }>({
    name: "",
    description: "",
    price: "",
    available: true,
    trackStock: true,
    stockOnHand: "0",
    sku: "",
    categoryId: "",
    imageUrl: null,
  })

  // Pending image, uploaded on submit — same flow as the POS store settings tab
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast.error(id ? "Hanya file gambar yang diizinkan." : "Only image files are allowed.")
      return
    }
    if (file.size > 2_000_000) {
      toast.error(id ? "Gambar maksimal 2 MB." : "Image must be 2 MB or smaller.")
      return
    }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const clearImage = () => {
    setImageFile(null)
    setImagePreview(null)
    setForm((prev) => ({ ...prev, imageUrl: null }))
  }

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [itemsRes, catsRes] = await Promise.all([
        fetch(`/api/pos/stores/${storeId}/items`, { cache: "no-store" }),
        fetch(`/api/pos/stores/${storeId}/categories`, { cache: "no-store" }),
      ])
      setItems(itemsRes.ok ? await itemsRes.json() : [])
      setCategories(catsRes.ok ? await catsRes.json() : [])
    } catch {
      toast.error(id ? "Gagal memuat katalog." : "Could not load catalog.")
    } finally {
      setLoading(false)
    }
  }, [storeId, id])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchQ = item.name.toLowerCase().includes(query.toLowerCase())
      const matchC = catFilter ? item.categoryId === catFilter : true
      return matchQ && matchC
    })
  }, [items, query, catFilter])

  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  const openCreate = () => {
    setEditing(null)
    setImageFile(null)
    setImagePreview(null)
    setForm({ name: "", description: "", price: "", available: true, trackStock: true, stockOnHand: "0", sku: "", categoryId: "", imageUrl: null })
    setDialogOpen(true)
  }

  const openEdit = (item: Item) => {
    setEditing(item)
    setImageFile(null)
    setImagePreview(null)
    setForm({
      name: item.name,
      description: item.description ?? "",
      price: item.price,
      available: item.available,
      trackStock: item.trackStock,
      stockOnHand: String(item.stockOnHand),
      sku: item.sku ?? "",
      categoryId: item.categoryId ?? "",
      imageUrl: item.imageUrl,
    })
    setDialogOpen(true)
  }

  const saveItem = async () => {
    if (!form.name.trim() || !form.price) return
    setSaving(true)
    try {
      // 1. Upload the picked image (if any) via the server — no preset needed
      let imageUrl = form.imageUrl
      if (imageFile) {
        const fd = new FormData()
        fd.append("file", imageFile)
        const upRes = await fetch("/api/pos/upload", { method: "POST", body: fd })
        if (!upRes.ok) throw new Error((await upRes.json()).error ?? (id ? "Unggah gambar gagal." : "Image upload failed."))
        imageUrl = (await upRes.json()).url
      }

      const body = {
        name: form.name.trim(),
        description: form.description || null,
        imageUrl,
        price: Number(form.price),
        available: form.available,
        trackStock: form.trackStock,
        stockOnHand: Number(form.stockOnHand),
        sku: form.sku || null,
        categoryId: form.categoryId || null,
      }
      const url = editing
        ? `/api/pos/stores/${storeId}/items/${editing.id}`
        : `/api/pos/stores/${storeId}/items`
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDialogOpen(false)
      setImageFile(null)
      setImagePreview(null)
      await load()
      toast.success(editing
        ? (id ? "Item diperbarui." : "Item updated.")
        : (id ? "Item ditambahkan." : "Item added."))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (id ? "Gagal menyimpan." : "Save failed."))
    } finally {
      setSaving(false)
    }
  }

  const deleteItem = async (item: Item) => {
    if (!confirm(id ? `Hapus "${item.name}"?` : `Delete "${item.name}"?`)) return
    setDeleting(item.id)
    try {
      const res = await fetch(`/api/pos/stores/${storeId}/items/${item.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      await load()
      toast.success(id ? `"${item.name}" dihapus.` : `"${item.name}" deleted.`)
    } catch {
      toast.error(id ? "Gagal menghapus." : "Delete failed.")
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-1 flex-wrap gap-2">
          <div className="relative min-w-48 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(0) }}
              placeholder={id ? "Cari item…" : "Search items…"}
              className="pl-8"
            />
          </div>
          <select
            value={catFilter ?? ""}
            onChange={(e) => { setCatFilter(e.target.value || null); setPage(0) }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{id ? "Semua Kategori" : "All Categories"}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        {canWrite && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" />
            {id ? "Tambah Item" : "Add Item"}
          </Button>
        )}
      </div>

      {/* Count */}
      {!loading && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} {id ? "item" : "items"}
          {catFilter || query ? (id ? " ditemukan" : " found") : ""}
        </p>
      )}

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">{id ? "Nama" : "Name"}</th>
                <th className="px-4 py-3 text-left font-medium">{id ? "Harga" : "Price"}</th>
                <th className="px-4 py-3 text-left font-medium">{id ? "Stok" : "Stock"}</th>
                <th className="px-4 py-3 text-left font-medium">{id ? "Status" : "Status"}</th>
                <th className="px-4 py-3 text-left font-medium">{id ? "Kategori" : "Category"}</th>
                {canWrite && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
                  </td>
                </tr>
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted-foreground">
                    <Package className="mx-auto mb-2 size-8 opacity-30" />
                    <p>{id ? "Tidak ada item." : "No items found."}</p>
                  </td>
                </tr>
              ) : (
                pageItems.map((item) => {
                  const cat = categories.find((c) => c.id === item.categoryId)
                  return (
                    <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted">
                            {item.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.imageUrl} alt={item.name} className="size-full object-cover" />
                            ) : (
                              <ImagePlus className="size-4 text-muted-foreground/60" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium">{item.name}</p>
                            {item.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1">{item.description}</p>
                            )}
                            {item.sku && <p className="text-2xs text-muted-foreground/60">SKU: {item.sku}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-sm">{fmt(item.price, currency)}</td>
                      <td className="px-4 py-3 text-sm">
                        {item.trackStock ? item.stockOnHand : (id ? "∞" : "∞")}
                        {item.trackStock && item.stockOnHand <= item.lowStockAt && item.stockOnHand > 0 && (
                          <span className="ml-1 text-3xs text-amber-600 font-semibold">LOW</span>
                        )}
                        {item.trackStock && item.stockOnHand === 0 && (
                          <span className="ml-1 text-3xs text-destructive font-semibold">OOS</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          className={
                            item.available
                              ? "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400 text-3xs"
                              : "bg-muted text-muted-foreground hover:bg-muted text-3xs"
                          }
                        >
                          {item.available
                            ? (id ? "Tersedia" : "Available")
                            : (id ? "Tidak tersedia" : "Unavailable")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {cat?.name ?? "—"}
                      </td>
                      {canWrite && (
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              onClick={() => openEdit(item)}
                              aria-label={id ? "Ubah item" : "Edit item"}
                            >
                              <Edit2 className="size-3.5" />
                            </Button>
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              disabled={deleting === item.id}
                              onClick={() => deleteItem(item)}
                              aria-label={id ? "Hapus item" : "Delete item"}
                            >
                              {deleting === item.id
                                ? <Loader2 className="size-3.5 animate-spin" />
                                : <Trash2 className="size-3.5 text-destructive" />}
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {id
              ? `Halaman ${page + 1} dari ${totalPages}`
              : `Page ${page + 1} of ${totalPages}`}
          </p>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
              {id ? "Sebelumnya" : "Prev"}
            </Button>
            <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
              {id ? "Berikutnya" : "Next"}
            </Button>
          </div>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? (id ? "Ubah Item" : "Edit Item") : (id ? "Tambah Item" : "Add Item")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 pt-2">
            {/* Item image */}
            <div className="space-y-1">
              <Label className="text-xs">{id ? "Gambar Item" : "Item Image"}</Label>
              <div className="flex items-center gap-3">
                <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted">
                  {imagePreview || form.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imagePreview ?? form.imageUrl ?? ""} alt={form.name || "Item image"} className="size-full object-cover" />
                  ) : (
                    <ImagePlus className="size-6 text-muted-foreground/60" />
                  )}
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="pos-item-image"
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/50"
                  >
                    <UploadCloud className="size-4" />
                    {imagePreview || form.imageUrl
                      ? (id ? "Klik untuk ganti" : "Click to change")
                      : (id ? "Klik untuk unggah (PNG, JPG, maks 2 MB)" : "Click to upload (PNG, JPG, max 2 MB)")}
                  </label>
                  <input
                    id="pos-item-image"
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={handleImageChange}
                    disabled={saving}
                  />
                  {(imagePreview || form.imageUrl) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive"
                      disabled={saving}
                      onClick={clearImage}
                    >
                      {id ? "Hapus Gambar" : "Remove Image"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{id ? "Nama" : "Name"} *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={80}
                placeholder={id ? "Mis: Kopi Susu" : "e.g. Latte"}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{id ? "Deskripsi" : "Description"}</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={500}
                placeholder={id ? "Deskripsi singkat…" : "Short description…"}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">{id ? "Harga" : "Price"} *</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">SKU</Label>
                <Input
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  maxLength={64}
                  placeholder="Optional"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{id ? "Kategori" : "Category"}</Label>
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">{id ? "Tanpa kategori" : "No category"}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={form.available}
                  onChange={(e) => setForm({ ...form, available: e.target.checked })}
                />
                {id ? "Tersedia" : "Available"}
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                <input
                  type="checkbox"
                  checked={form.trackStock}
                  onChange={(e) => setForm({ ...form, trackStock: e.target.checked })}
                />
                {id ? "Lacak stok" : "Track stock"}
              </label>
            </div>
            {form.trackStock && (
              <div className="space-y-1">
                <Label className="text-xs">{id ? "Stok Saat Ini" : "Current Stock"}</Label>
                <Input
                  type="number"
                  min="0"
                  value={form.stockOnHand}
                  onChange={(e) => setForm({ ...form, stockOnHand: e.target.value })}
                />
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1"
                disabled={!form.name.trim() || !form.price || saving}
                onClick={saveItem}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {id ? "Simpan" : "Save"}
              </Button>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {id ? "Batal" : "Cancel"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

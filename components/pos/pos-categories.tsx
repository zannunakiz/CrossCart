"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Edit2, Loader2, Plus, Tag, Trash2 } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useLanguage } from "@/lib/i18n"

type Category = { id: string; name: string; description: string | null; sortOrder: number; active: boolean }

export function PosCategories({ storeId }: { storeId: string }) {
  const lang = useLanguage()
  const id = lang === "ID"
  const [cats, setCats] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm] = useState({ name: "", description: "", sortOrder: "0" })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pos/stores/${storeId}/categories`, { cache: "no-store" })
      setCats(res.ok ? await res.json() : [])
    } catch {
      toast.error(id ? "Gagal memuat kategori." : "Could not load categories.")
    } finally {
      setLoading(false)
    }
  }, [storeId, id])

  useEffect(() => { void load() }, [load])

  const openCreate = () => {
    setEditing(null)
    setForm({ name: "", description: "", sortOrder: String(cats.length) })
    setDialogOpen(true)
  }

  const openEdit = (cat: Category) => {
    setEditing(cat)
    setForm({ name: cat.name, description: cat.description ?? "", sortOrder: String(cat.sortOrder) })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const body = { name: form.name.trim(), description: form.description || null, sortOrder: Number(form.sortOrder) }
      const url = editing
        ? `/api/pos/stores/${storeId}/categories/${editing.id}`
        : `/api/pos/stores/${storeId}/categories`
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setDialogOpen(false)
      await load()
      toast.success(editing ? (id ? "Kategori diperbarui." : "Category updated.") : (id ? "Kategori dibuat." : "Category created."))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (id ? "Gagal." : "Failed."))
    } finally {
      setSaving(false)
    }
  }

  const deleteCat = async (cat: Category) => {
    if (!confirm(id ? `Hapus "${cat.name}"?` : `Delete "${cat.name}"?`)) return
    setDeleting(cat.id)
    try {
      // There's no DELETE endpoint for categories yet — use PATCH to deactivate
      const res = await fetch(`/api/pos/stores/${storeId}/categories/${cat.id}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error()
      await load()
      toast.success(id ? "Kategori dihapus." : "Category deleted.")
    } catch {
      toast.error(id ? "Gagal menghapus." : "Delete failed.")
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">{id ? "Kategori Menu" : "Menu Categories"}</h2>
          <p className="text-xs text-muted-foreground">{id ? "Atur urutan tampilan menu." : "Organize menu display order."}</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" />
          {id ? "Tambah" : "Add"}
        </Button>
      </div>

      <div className="rounded-xl border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : cats.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Tag className="mx-auto mb-2 size-8 opacity-30" />
            <p className="text-sm">{id ? "Belum ada kategori." : "No categories yet."}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">{id ? "Nama" : "Name"}</th>
                <th className="px-4 py-3 text-left font-medium">{id ? "Deskripsi" : "Description"}</th>
                <th className="px-4 py-3 text-left font-medium">{id ? "Urutan" : "Order"}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {cats.map((cat) => (
                <tr key={cat.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{cat.name}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{cat.description ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">{cat.sortOrder}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="icon-xs" variant="ghost" onClick={() => openEdit(cat)}>
                        <Edit2 className="size-3.5" />
                      </Button>
                      <Button size="icon-xs" variant="ghost" disabled={deleting === cat.id} onClick={() => deleteCat(cat)}>
                        {deleting === cat.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5 text-destructive" />}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? (id ? "Ubah Kategori" : "Edit Category") : (id ? "Tambah Kategori" : "Add Category")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 pt-2">
            <div className="space-y-1">
              <Label className="text-xs">{id ? "Nama" : "Name"} *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={48} placeholder={id ? "Mis: Minuman" : "e.g. Drinks"} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{id ? "Deskripsi" : "Description"}</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={140} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{id ? "Urutan Tampil" : "Sort Order"}</Label>
              <Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={!form.name.trim() || saving} onClick={save}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {id ? "Simpan" : "Save"}
              </Button>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>{id ? "Batal" : "Cancel"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

"use client"

import { Loader2, UploadCloud } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useLanguage } from "@/lib/i18n"

type Store = {
  id: string
  name: string
  slug: string
  currency: string
  description: string | null
  telephone: string | null
  address: string | null
  imageUrl: string | null
  isOpen: boolean
}

export function PosSettings({ storeId }: { storeId: string }) {
  const lang = useLanguage()
  const id = lang === "ID"
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Store | null>(null)
  // Pending image, uploaded on submit — same flow as the quickstore settings tab
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // `/api/pos/stores` returns every store the user owns or is a member of
      const resStores = await fetch(`/api/pos/stores`, { cache: "no-store" })
      const stores = await resStores.json()
      const store = stores.find((s: Store) => s.id === storeId)
      if (store) setForm(store)
    } catch {
      toast.error(id ? "Gagal memuat pengaturan." : "Could not load settings.")
    } finally {
      setLoading(false)
    }
  }, [storeId, id])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2_000_000) {
      toast.error(id ? "Gambar maksimal 2 MB." : "Image must be 2 MB or smaller.")
      return
    }
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const save = async () => {
    if (!form || !form.name.trim()) return
    setSaving(true)
    try {
      // 1. Upload the picked image (if any) via the server — no preset needed
      let imageUrl = form.imageUrl
      if (imageFile) {
        const fd = new FormData()
        fd.append("file", imageFile)
        const upRes = await fetch("/api/pos/upload", { method: "POST", body: fd })
        if (!upRes.ok) throw new Error((await upRes.json()).error)
        imageUrl = (await upRes.json()).url
      }

      // 2. Save the store
      const res = await fetch(`/api/pos/stores/${storeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description || null,
          telephone: form.telephone || null,
          address: form.address || null,
          currency: form.currency,
          isOpen: form.isOpen,
          imageUrl,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setForm({ ...form, imageUrl })
      setImageFile(null)
      setImagePreview(null)
      toast.success(id ? "Pengaturan disimpan." : "Settings saved.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (id ? "Gagal menyimpan." : "Save failed."))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="py-12 text-center"><Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" /></div>
  if (!form) return <div className="py-12 text-center text-muted-foreground">{id ? "Toko tidak ditemukan." : "Store not found."}</div>

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">{id ? "Informasi Umum" : "General Information"}</h2>
          <p className="text-xs text-muted-foreground">{id ? "Detail toko Anda." : "Your store details."}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">{id ? "Nama Toko" : "Store Name"} *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={20} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{id ? "Mata Uang" : "Currency"}</Label>
            <select
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="IDR">IDR</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div className="col-span-full space-y-1.5">
            <Label className="text-xs">{id ? "Deskripsi" : "Description"}</Label>
            <Input value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{id ? "Telepon" : "Telephone"}</Label>
            <Input value={form.telephone || ""} onChange={(e) => setForm({ ...form, telephone: e.target.value })} maxLength={24} />
          </div>
          <div className="col-span-full space-y-1.5">
            <Label className="text-xs">{id ? "Alamat" : "Address"}</Label>
            <Input value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={240} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">{id ? "Operasional" : "Operations"}</h2>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={form.isOpen}
              onChange={(e) => setForm({ ...form, isOpen: e.target.checked })}
              className="size-4"
            />
            {id ? "Toko Buka (Menerima Pesanan)" : "Store is Open (Accepting Orders)"}
          </label>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">{id ? "Logo / Gambar Toko" : "Store Image"}</h2>
          <p className="text-xs text-muted-foreground">
            {id ? "Unggah logo atau foto toko (PNG, JPG, maks 2 MB)." : "Upload a store logo or photo (PNG, JPG, max 2 MB)."}
          </p>
        </div>
        <div className="flex items-start gap-4">
          <div className="size-24 shrink-0 rounded-lg border bg-muted flex items-center justify-center overflow-hidden">
            {imagePreview || form.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagePreview ?? form.imageUrl ?? ""} alt="Store logo" className="size-full object-cover" />
            ) : (
              <span className="text-xs text-muted-foreground">{id ? "Tidak ada" : "None"}</span>
            )}
          </div>
          <div className="space-y-2">
            <label
              htmlFor="pos-store-image"
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/50"
            >
              <UploadCloud className="size-4" />
              {imagePreview || form.imageUrl
                ? (id ? "Klik untuk ganti" : "Click to change")
                : (id ? "Klik untuk unggah (PNG, JPG, maks 2 MB)" : "Click to upload (PNG, JPG, max 2 MB)")}
            </label>
            <input
              id="pos-store-image"
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
                className="text-destructive"
                disabled={saving}
                onClick={() => {
                  setImageFile(null)
                  setImagePreview(null)
                  setForm({ ...form, imageUrl: null })
                }}
              >
                {id ? "Hapus Gambar" : "Remove Image"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <Button disabled={!form.name.trim() || saving} onClick={save}>
        {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
        {id ? "Simpan Pengaturan" : "Save Settings"}
      </Button>
    </div>
  )
}

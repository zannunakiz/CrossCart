"use client"

import { useState } from "react"
import { Loader2, UploadCloud } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import type { Store } from "@/lib/db/schema"

interface Props {
  store: Store
  onUpdated: (store: Store) => void
}

export function StoreSettingsTab({ store, onUpdated }: Props) {
  const [name, setName] = useState(store.name)
  const [description, setDescription] = useState(store.description ?? "")
  const [open, setOpen] = useState(store.open)
  const [qrFile, setQrFile] = useState<File | null>(null)
  const [qrPreview, setQrPreview] = useState<string | null>(store.paymentQr ?? null)
  const [submitting, setSubmitting] = useState(false)

  const handleQrChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setQrFile(file)
    setQrPreview(URL.createObjectURL(file))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return toast.error("Store name is required")
    if (submitting) return
    setSubmitting(true)

    try {
      let paymentQr = store.paymentQr

      if (qrFile) {
        const fd = new FormData()
        fd.append("file", qrFile)
        const upRes = await fetch("/api/quickstore/upload", { method: "POST", body: fd })
        if (!upRes.ok) throw new Error((await upRes.json()).error ?? "Upload failed")
        const { url } = await upRes.json()
        paymentQr = url
      }

      const res = await fetch(`/api/quickstore/stores/${store.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          open,
          paymentQr,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "Update failed")
      const updated = await res.json()
      onUpdated(updated)
      setQrFile(null)
      toast.success("Store settings saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-1.5">
          <Label htmlFor="settings-name">
            Store Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="settings-name"
            maxLength={20}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
          />
          <p className="text-right text-[11px] text-muted-foreground">{name.length}/20</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="settings-description">Description</Label>
          <Textarea
            id="settings-description"
            maxLength={100}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
          />
          <p className="text-right text-[11px] text-muted-foreground">{description.length}/100</p>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border p-4">
          <div>
            <p className="text-sm font-medium">Open for Orders</p>
            <p className="text-xs text-muted-foreground">Customers can browse and buy</p>
          </div>
          <Switch
            id="settings-open"
            checked={open}
            onCheckedChange={setOpen}
            disabled={submitting}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="settings-qr">Payment QR Code</Label>
          <label
            htmlFor="settings-qr"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-5 transition-colors hover:bg-muted/50"
          >
            {qrPreview ? (
              <div className="flex flex-col items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrPreview} alt="Payment QR" className="h-28 w-28 object-contain rounded-lg" />
                <span className="text-xs text-muted-foreground">Click to change</span>
              </div>
            ) : (
              <>
                <UploadCloud className="size-7 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Upload payment QR (PNG, JPG, max 2 MB)
                </span>
              </>
            )}
          </label>
          <input
            id="settings-qr"
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={handleQrChange}
            disabled={submitting}
          />
        </div>

        <Button
          id="settings-save-btn"
          type="submit"
          disabled={submitting || !name.trim()}
          className="w-full sm:w-auto"
        >
          {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
          Save Settings
        </Button>
      </form>
    </div>
  )
}

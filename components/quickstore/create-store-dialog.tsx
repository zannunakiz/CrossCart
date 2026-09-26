"use client"

import { useState } from "react"
import { Loader2, UploadCloud } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { serverText, useTranslation } from "@/lib/i18n"
import type { Store } from "@/lib/db/schema"

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: (store: Store) => void
}

export function CreateStoreDialog({ open, onOpenChange, onCreated }: Props) {
  const { lang, t } = useTranslation()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [isOpen, setIsOpen] = useState(true)
  const [qrFile, setQrFile] = useState<File | null>(null)
  const [qrPreview, setQrPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setName("")
    setDescription("")
    setIsOpen(true)
    setQrFile(null)
    setQrPreview(null)
  }

  const handleQrChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setQrFile(file)
    setQrPreview(URL.createObjectURL(file))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return toast.error(t("Store name is required"))
    if (submitting) return
    setSubmitting(true)

    try {
      // 1. Upload QR if provided
      let paymentQr: string | undefined
      if (qrFile) {
        const fd = new FormData()
        fd.append("file", qrFile)
        const upRes = await fetch("/api/quickstore/upload", { method: "POST", body: fd })
        if (!upRes.ok) {
          const err = await upRes.json()
          throw new Error(err.error ?? t("Upload failed"))
        }
        const { url } = await upRes.json()
        paymentQr = url
      }

      // 2. Create store
      const res = await fetch("/api/quickstore/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          open: isOpen,
          paymentQr,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? t("Failed to create store"))
      }
      const created = await res.json()
      onCreated(created)
      onOpenChange(false)
      reset()
    } catch (err) {
      toast.error(err instanceof Error ? serverText(lang, err.message) : t("Something went wrong"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) { onOpenChange(v); if (!v) reset() } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Create New Store")}</DialogTitle>
          <DialogDescription>
            {t("Set up your micro-store in seconds.")}
          </DialogDescription>
        </DialogHeader>

        <form id="create-store-form" onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="store-name">
              {t("Store Name")} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="store-name"
              placeholder={t("e.g. Kopi Kevin")}
              maxLength={20}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
            />
            <p className="text-right text-[11px] text-muted-foreground">
              {name.length}/20
            </p>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="store-description">{t("Description")}</Label>
            <Textarea
              id="store-description"
              placeholder={t("Short description of your store...")}
              maxLength={100}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
            />
            <p className="text-right text-[11px] text-muted-foreground">
              {description.length}/100
            </p>
          </div>

          {/* Open toggle */}
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">{t("Open for orders")}</p>
              <p className="text-xs text-muted-foreground">{t("Customers can browse and buy")}</p>
            </div>
            <Switch
              id="store-open"
              checked={isOpen}
              onCheckedChange={setIsOpen}
              disabled={submitting}
            />
          </div>

          {/* QR Upload */}
          <div className="space-y-1.5">
            <Label htmlFor="store-qr">{t("Payment QR (optional)")}</Label>
            <label
              htmlFor="store-qr"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
            >
              {qrPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrPreview} alt={t("QR preview")} className="h-24 w-24 object-contain rounded" />
              ) : (
                <>
                  <UploadCloud className="size-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {t("Click to upload (PNG, JPG, max 2 MB)")}
                  </span>
                </>
              )}
            </label>
            <input
              id="store-qr"
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleQrChange}
              disabled={submitting}
            />
          </div>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => { onOpenChange(false); reset() }}
            disabled={submitting}
          >
            {t("Cancel")}
          </Button>
          <Button
            id="create-store-submit"
            type="submit"
            form="create-store-form"
            disabled={submitting || !name.trim()}
          >
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t("Create Store")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

"use client"

import { Check, Copy, ExternalLink, QrCode } from "lucide-react"
import QRCode from "qrcode"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useLanguage } from "@/lib/i18n"

/**
 * Share the customer menu link as a QR + copyable URL, so the resto can put it
 * on the table / window for walk-in guests to start ordering.
 */
export function ShareOrderDialog({
  open,
  onOpenChange,
  slug,
  storeName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  slug: string
  storeName?: string
}) {
  const lang = useLanguage()
  const id = lang === "ID"
  const [url, setUrl] = useState("")
  const [qr, setQr] = useState("")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    let active = true
    const link = `${window.location.origin}/order/${slug}`
    void QRCode.toDataURL(link, { width: 512, margin: 1, errorCorrectionLevel: "M" }).then((data) => {
      if (!active) return
      setUrl(link)
      setQr(data)
      setCopied(false)
    })
    return () => { active = false }
  }, [open, slug])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success(id ? "Link disalin ke clipboard." : "Link copied to clipboard.")
    } catch {
      toast.error(id ? "Gagal menyalin link." : "Could not copy the link.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {id ? "Bagikan menu ke pelanggan" : "Share the menu with customers"}
          </DialogTitle>
          <DialogDescription>
            {id
              ? "Cetak atau tampilkan QR ini di meja/kasir, atau kirim linknya."
              : "Print or display this QR on the table/counter, or send the link."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="mx-auto grid size-56 place-items-center rounded-lg border bg-white p-3">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt={id ? "QR menu pelanggan" : "Customer menu QR"} className="size-full" />
            ) : (
              <QrCode className="size-16 text-foreground" />
            )}
          </div>

          {storeName && (
            <p className="text-center text-sm font-semibold">{storeName}</p>
          )}

          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{url}</span>
            <Button size="icon-sm" variant="ghost" onClick={copy} aria-label="Copy link">
              {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button onClick={copy}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {id ? "Salin link" : "Copy link"}
            </Button>
            <Button
              variant="outline"
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
            >
              <ExternalLink className="size-4" />
              {id ? "Buka menu" : "Open menu"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

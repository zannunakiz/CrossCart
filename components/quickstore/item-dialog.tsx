"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { StoreItem } from "@/lib/db/schema"
import { serverText, useTranslation } from "@/lib/i18n"

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  storeId: string
  item: StoreItem | null
  onSaved: (item: StoreItem) => void
}

export function ItemDialog({ open, onOpenChange, storeId, item, onSaved }: Props) {
  const { lang, t } = useTranslation()
  const isEdit = !!item

  const [name, setName] = useState(item?.name ?? "")
  const [description, setDescription] = useState(item?.description ?? "")
  const [price, setPrice] = useState(item ? String(item.price) : "0")
  const [currency, setCurrency] = useState<"USD" | "IDR">(item?.currency ?? "IDR")
  const [available, setAvailable] = useState(item?.available ?? true)
  const [stocks, setStocks] = useState(item?.stocks != null ? String(item.stocks) : "")
  const [discountPercent, setDiscountPercent] = useState(String(item?.discountPercent ?? 0))
  const [highlight, setHighlight] = useState(item?.highlight ?? false)
  const [submitting, setSubmitting] = useState(false)

  /**
   * Re-hydrate the draft every time the dialog opens: the table reuses one
   * dialog instance for every row, so without this a previous item (or a
   * cancelled draft) could leak into the next open.
   */
  useEffect(() => {
    if (!open) return
    /* eslint-disable react-hooks/set-state-in-effect -- hydrating the form on open */
    setName(item?.name ?? "")
    setDescription(item?.description ?? "")
    setPrice(item ? String(item.price) : "0")
    setCurrency(item?.currency ?? "IDR")
    setAvailable(item?.available ?? true)
    setStocks(item?.stocks != null ? String(item.stocks) : "")
    setDiscountPercent(String(item?.discountPercent ?? 0))
    setHighlight(item?.highlight ?? false)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, item])

  const reset = () => {
    setName("")
    setDescription("")
    setPrice("0")
    setCurrency("IDR")
    setAvailable(true)
    setStocks("")
    setDiscountPercent("0")
    setHighlight(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return toast.error(t("Item name is required"))
    if (submitting) return
    setSubmitting(true)

    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      price: parseFloat(price) || 0,
      currency,
      available,
      stocks: stocks !== "" ? parseInt(stocks) : undefined,
      discountPercent: parseInt(discountPercent) || 0,
      highlight,
    }

    try {
      const url = isEdit
        ? `/api/quickstore/stores/${storeId}/items/${item!.id}`
        : `/api/quickstore/stores/${storeId}/items`
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? t("Save failed"))
      const saved = await res.json()
      onSaved(saved)
      onOpenChange(false)
      if (!isEdit) reset()
    } catch (err) {
      toast.error(err instanceof Error ? serverText(lang, err.message) : t("Something went wrong"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!submitting) {
          onOpenChange(v)
          if (!v && !isEdit) reset()
        }
      }}
    >
      {/* Same dialog sizing as the "Create New Store" dialog: breathing room
          outside the box on phones, 28rem capped from `sm` up. */}
      <DialogContent className="max-w-[calc(100%-3rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-bold">
            {isEdit ? t("Edit Item") : t("Add New Item")}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? t("Update item details.") : t("Add a new item to your store.")}
          </DialogDescription>
        </DialogHeader>

        {/* The body scrolls, the header and the footer stay put on a phone.
            `-mx-4 px-4` bleeds the scroller into the dialog's `p-4`, so the
            fields stay aligned with the title while the scrollport keeps a
            16px gutter on both sides: the 3px focus ring is never clipped on
            the left, and the global 10px scrollbar sits in the gutter instead
            of covering the right edge of the inputs. `py-1` does the same for
            the first and last field when the body is scrolled. */}
        <form
          id="item-form"
          onSubmit={handleSubmit}
          className="-mx-4 max-h-[52dvh] space-y-4 overflow-y-auto px-4 py-1 sm:max-h-[60dvh]"
        >
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="item-name">
              {t("Name")} <span className="text-destructive">*</span>
            </Label>
            <Input
              id="item-name"
              placeholder={t("e.g. Kopi Susu")}
              maxLength={20}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
            />
            <p className="text-right text-2xs text-muted-foreground">{name.length}/20</p>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="item-desc">{t("Description")}</Label>
            <Textarea
              id="item-desc"
              placeholder={t("Short description...")}
              maxLength={100}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
            />
            <p className="text-right text-2xs text-muted-foreground">{description.length}/100</p>
          </div>

          {/* Price + Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="item-price">{t("Price")}</Label>
              <Input
                id="item-price"
                type="number"
                min="0"
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-currency">{t("Currency")}</Label>
              <Select
                value={currency}
                onValueChange={(v) => setCurrency(v as "USD" | "IDR")}
                disabled={submitting}
              >
                <SelectTrigger id="item-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IDR">{t("IDR (Rupiah)")}</SelectItem>
                  <SelectItem value="USD">{t("USD (Dollar)")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Stocks + Discount */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="item-stocks">{t("Stocks (leave blank = unlimited)")}</Label>
              <Input
                id="item-stocks"
                type="number"
                min="0"
                placeholder="∞"
                value={stocks}
                onChange={(e) => setStocks(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-discount">{t("Discount %")}</Label>
              <Input
                id="item-discount"
                type="number"
                min="0"
                max="100"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-xs font-medium">{t("Available")}</p>
                <p className="text-2xs text-muted-foreground">{t("Show to customers")}</p>
              </div>
              <Switch
                id="item-available"
                checked={available}
                onCheckedChange={setAvailable}
                disabled={submitting}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-xs font-medium">{t("Highlight")}</p>
                <p className="text-2xs text-muted-foreground">{t("Pin to top")}</p>
              </div>
              <Switch
                id="item-highlight"
                checked={highlight}
                onCheckedChange={setHighlight}
                disabled={submitting}
              />
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t("Cancel")}
          </Button>
          <Button
            id="item-submit"
            type="submit"
            form="item-form"
            disabled={submitting || !name.trim()}
            className="font-bold"
          >
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {isEdit ? t("Save Changes") : t("Add Item")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

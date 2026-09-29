"use client"

import { useEffect, useMemo, useRef, useState } from "react"
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
import { createStoreItem, updateStoreItem } from "@/lib/actions/item-actions"
import type { StoreItem } from "@/lib/db/schema"
import { UNKNOWN_ERROR_PHRASE, serverText, useTranslation } from "@/lib/i18n"
import {
  DESCRIPTION_MAX_LENGTH,
  MAX_DISCOUNT_PERCENT,
  MAX_STOCKS,
  NAME_MAX_LENGTH,
  PRICE_MAX_DIGITS,
  formatCents,
  formatPriceInput,
  priceDigits,
  toCents,
} from "@/lib/quickstore/cashier"

/**
 * Digit ceiling of each numeric box, derived from its own max so the input can
 * never hold more digits than the value is allowed to have: 999 → 3, 100 → 3.
 */
const MAX_STOCK_DIGITS = String(MAX_STOCKS).length
const MAX_DISCOUNT_DIGITS = String(MAX_DISCOUNT_PERCENT).length

/** Digits only, capped at `maxDigits` (pastes and spinners included). */
const limitDigits = (value: string, maxDigits: number) =>
  value.replace(/\D/g, "").slice(0, maxDigits)

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
  // The price box only ever holds formatted digits: "1000000" → "1.000.000".
  const [price, setPrice] = useState(item ? formatCents(toCents(item.price)) : "")
  const [available, setAvailable] = useState(item?.available ?? true)
  const [stocks, setStocks] = useState(item?.stocks != null ? String(item.stocks) : "")
  const [discountPercent, setDiscountPercent] = useState(String(item?.discountPercent ?? 0))
  const [submitting, setSubmitting] = useState(false)
  // Bumped after a successful "Add Item": the name box below is (re)focused once
  // the request finished, so the next item can be typed without reaching for it.
  const [focusToken, setFocusToken] = useState(0)
  const nameRef = useRef<HTMLInputElement>(null)

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
    setPrice(item ? formatCents(toCents(item.price)) : "")
    setAvailable(item?.available ?? true)
    setStocks(item?.stocks != null ? String(item.stocks) : "")
    setDiscountPercent(String(item?.discountPercent ?? 0))
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, item])

  /**
   * Focus the name box after a successful add. The effect runs once React has
   * committed, which matters because the input is `disabled` while `submitting`.
   */
  useEffect(() => {
    if (focusToken === 0 || submitting) return
    nameRef.current?.focus()
  }, [focusToken, submitting])

  const reset = () => {
    setName("")
    setDescription("")
    setPrice("")
    setAvailable(true)
    setStocks("")
    setDiscountPercent("0")
  }

  // ── Validation — every field must be filled before the form can be sent ────
  // (stock stays optional: blank still means "unlimited")
  const stockValue = Number.parseInt(stocks, 10)
  const stockValid =
    stocks.trim() === "" ||
    (Number.isInteger(stockValue) && stockValue >= 0 && stockValue <= MAX_STOCKS)
  const discountValue = Number.parseInt(discountPercent, 10)
  const discountValid =
    discountPercent.trim() !== "" &&
    String(discountValue) === discountPercent.trim() &&
    discountValue >= 0 &&
    discountValue <= 100
  const formValid =
    name.trim() !== "" &&
    description.trim() !== "" &&
    priceDigits(price) !== "" &&
    stockValid &&
    discountValid

  /*
   * "Save Changes" only means something once something actually changed: an
   * edit dialog opened, read and closed again must not fire a PUT. Every field
   * is compared against the item exactly as it was hydrated into the form — the
   * price through the same formatter — so formatting alone is never a change.
   * Add mode has nothing to compare against, so it always counts as changed.
   */
  const pristine = useMemo(
    () =>
      item
        ? {
            name: item.name,
            description: item.description ?? "",
            price: formatCents(toCents(item.price)),
            available: item.available,
            stocks: item.stocks != null ? String(item.stocks) : "",
            discountPercent: String(item.discountPercent ?? 0),
          }
        : null,
    [item]
  )

  const changed =
    pristine === null ||
    name !== pristine.name ||
    description !== pristine.description ||
    price !== pristine.price ||
    available !== pristine.available ||
    stocks !== pristine.stocks ||
    discountPercent !== pristine.discountPercent

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formValid || submitting) return
    setSubmitting(true)

    const payload = {
      name: name.trim(),
      description: description.trim(),
      // Sent as typed ("1.000.000"); the API validates and stores it.
      price,
      available,
      stocks: stocks.trim() === "" ? null : stockValue,
      discountPercent: discountValue,
    }

    try {
      const res = isEdit
        ? await updateStoreItem(storeId, item!.id, payload)
        : await createStoreItem(storeId, payload)
      if (!res.ok) throw new Error(res.error)
      onSaved(res.data)
      if (isEdit) {
        // Editing is a one-off: the form is closed after a successful save.
        onOpenChange(false)
        return
      }

      /*
       * Bulk entry: the dialog stays open, the table refreshes behind it
       * (`onSaved`) and ONLY the name is cleared — every other field keeps the
       * value just submitted, so repeating an item with the same settings is a
       * single retype of the name.
       */
      setName("")
      setFocusToken((token) => token + 1)
    } catch (err) {
      toast.error(err instanceof Error ? serverText(lang, err.message) : t(UNKNOWN_ERROR_PHRASE))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      // Misclick protection: only an explicit action closes this form. An
      // outside click (`disablePointerDismissal`) or Esc never discards a
      // half-filled item — the cashier must press Cancel or ✕.
      disablePointerDismissal
      onOpenChange={(v, details) => {
        if (!v && details.reason !== "close-press") return
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
              ref={nameRef}
              placeholder={t("e.g. Kopi Susu")}
              maxLength={NAME_MAX_LENGTH}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
            />
            <p className="text-right text-2xs text-muted-foreground">
              {name.length}/{NAME_MAX_LENGTH}
            </p>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="item-desc">
              {t("Description")} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="item-desc"
              placeholder={t("Short description...")}
              maxLength={DESCRIPTION_MAX_LENGTH}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
            />
            <p className="text-right text-2xs text-muted-foreground">
              {description.length}/{DESCRIPTION_MAX_LENGTH}
            </p>
          </div>

          {/*
           * Price + Discount share one row (both are per-unit numbers), and the
           * stock box gets a full row of its own below them.
           */}
          <div className="grid grid-cols-2 gap-3">
            {/* Price — numbers only, grouped in threes while typing */}
            <div className="space-y-1.5">
              <Label htmlFor="item-price">
                {t("Price")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="item-price"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="1.000.000"
                value={price}
                onChange={(e) => setPrice(formatPriceInput(e.target.value))}
                disabled={submitting}
              />
              <p className="text-right text-2xs text-muted-foreground">
                {priceDigits(price).length}/{PRICE_MAX_DIGITS}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="item-discount">
                {t("Discount %")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="item-discount"
                // Same digit-filtered pattern as Stocks: 3 digits, since 100 is
                // the ceiling.
                inputMode="numeric"
                autoComplete="off"
                maxLength={MAX_DISCOUNT_DIGITS}
                value={discountPercent}
                onChange={(e) => setDiscountPercent(limitDigits(e.target.value, MAX_DISCOUNT_DIGITS))}
                aria-invalid={!discountValid}
                disabled={submitting}
              />
              {!discountValid && (
                <p className="text-2xs font-medium text-destructive">
                  {t("Discount must be between 0 and 100")}
                </p>
              )}
            </div>
          </div>

          {/* Stocks — full width; a blank box still means "unlimited". */}
          <div className="space-y-1.5">
            <Label htmlFor="item-stocks">{t("Stocks (leave blank = unlimited)")}</Label>
            <Input
              id="item-stocks"
              // Text + digit filter (not `type="number"`, which ignores
              // `maxLength`): 3 digits, because 999 is the ceiling. A blank
              // value still means "unlimited".
              inputMode="numeric"
              autoComplete="off"
              maxLength={MAX_STOCK_DIGITS}
              placeholder="∞"
              value={stocks}
              onChange={(e) => setStocks(limitDigits(e.target.value, MAX_STOCK_DIGITS))}
              aria-invalid={!stockValid}
              disabled={submitting}
            />
            {!stockValid && (
              <p className="text-2xs font-medium text-destructive">
                {t("Stocks must be between 0 and {max}", { max: MAX_STOCKS })}
              </p>
            )}
          </div>

          {/* Toggles */}
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
            disabled={submitting || !formValid || !changed}
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

"use client"

import { Loader2, Trash2, UploadCloud } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import type { Store, StoreRole } from "@/lib/db/schema"
import { serverText, useTranslation } from "@/lib/i18n"
import {
  canEditStoreCredential,
  canEditStoreDetails,
  canEditStoreStatus,
} from "@/lib/quickstore/permissions"

interface Props {
  store: Store
  /** The signed-in user's role in this store — drives per-field permissions. */
  role: StoreRole
  /** True when the user created the store (implicit master). */
  isOwner?: boolean
  onUpdated: (store: Store) => void
  /** Master (store:delete) or the store owner — the only ones who may delete. */
  canDelete?: boolean
}

export function StoreSettingsTab({ store, role, isOwner = false, onUpdated, canDelete = false }: Props) {
  const { lang, t } = useTranslation()
  const router = useRouter()
  const [name, setName] = useState(store.name)
  const [description, setDescription] = useState(store.description ?? "")
  const [open, setOpen] = useState(store.open)
  const [qrFile, setQrFile] = useState<File | null>(null)
  const [qrPreview, setQrPreview] = useState<string | null>(store.paymentQr ?? null)
  const [submitting, setSubmitting] = useState(false)
  // Inline confirm: the Delete Store button swaps itself for "Delete?" + Yes/No.
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const shouldReduceMotion = useReducedMotion()
  const entrance = (delay = 0) => ({
    initial: { opacity: 0, y: shouldReduceMotion ? 0 : 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: shouldReduceMotion ? 0.2 : 0.35, delay },
  })

  // Field-level permissions: a role may hold some of these but not others
  // (e.g. admins can flip open/close but may not touch details or the QR).
  const allowDetails = canEditStoreDetails(role) || isOwner
  const allowStatus = canEditStoreStatus(role) || isOwner
  const allowCredential = canEditStoreCredential(role) || isOwner
  const canEditAnything = allowDetails || allowStatus || allowCredential

  /**
   * Save is only offered when this role really changed something AND every
   * required field it may edit is valid. The comparison uses the values the API
   * last returned (`store`), so a saved form turns "clean" again on its own.
   */
  const detailsDirty =
    allowDetails &&
    (name.trim() !== store.name || description.trim() !== (store.description ?? ""))
  const statusDirty = allowStatus && open !== store.open
  const credentialDirty = allowCredential && qrFile !== null
  const isDirty = detailsDirty || statusDirty || credentialDirty
  const isNameValid = !allowDetails || name.trim().length > 0
  const canSave = canEditAnything && isDirty && isNameValid && !submitting

  const handleQrChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setQrFile(file)
    setQrPreview(URL.createObjectURL(file))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Nothing to save (disabled button, or Enter in a field) → no request.
    if (!canSave) {
      if (allowDetails && !isNameValid) toast.error(t("Store name is required"))
      return
    }
    // Only the fields this role may change are sent — the API re-checks anyway.
    setSubmitting(true)

    try {
      let paymentQr = store.paymentQr

      if (allowCredential && qrFile) {
        const fd = new FormData()
        fd.append("file", qrFile)
        const upRes = await fetch("/api/quickstore/upload", { method: "POST", body: fd })
        if (!upRes.ok) throw new Error((await upRes.json()).error ?? t("Upload failed"))
        const { url } = await upRes.json()
        paymentQr = url
      }

      const payload: Record<string, unknown> = {}
      if (allowDetails) {
        payload.name = name.trim()
        payload.description = description.trim() || null
      }
      if (allowStatus) payload.open = open
      if (allowCredential && paymentQr !== store.paymentQr) payload.paymentQr = paymentQr

      const res = await fetch(`/api/quickstore/stores/${store.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? t("Update failed"))
      const updated = await res.json()
      onUpdated(updated)
      setQrFile(null)
      toast.success(t("Store settings saved"))
    } catch (err) {
      toast.error(err instanceof Error ? serverText(lang, err.message) : t("Save failed"))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (deleting) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/quickstore/stores/${store.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error ?? t("Delete failed"))
      toast.success(t("Store deleted"))
      router.replace("/quickstore")
    } catch (err) {
      toast.error(err instanceof Error ? serverText(lang, err.message) : t("Delete failed"))
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="w-full">
      {/* Read-only explanation for roles without any store update permission. */}
      {!canEditAnything && (
        <motion.p {...entrance()} className="mb-5 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          {t("Only the store master can change these settings.")}
        </motion.p>
      )}
      {canEditAnything && !allowDetails && (
        <motion.p {...entrance()} className="mb-5 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          {t(
            "You can change the open status only — store details and the payment credential are master-only."
          )}
        </motion.p>
      )}

      {/* Grid container: 1 kolom di mobile, 2 kolom di desktop (lg) */}
      <div className="space-y-6 lg:grid lg:grid-cols-12 lg:items-start lg:gap-8 lg:space-y-0">
        {/* Kolom Kiri / Utama: Form Settings dalam Card */}
        <motion.div {...entrance(0.05)} className="lg:col-span-7">
          <Card>
            <CardHeader>
              <CardTitle>{t("Store Details")}</CardTitle>
              <CardDescription>
                {t("Manage your store profile, status, and payment configuration.")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-1.5">
                  <Label htmlFor="settings-name">
                    {t("Store Name")} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="settings-name"
                    maxLength={20}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={submitting || !allowDetails}
                  />
                  <p className="text-right text-2xs text-muted-foreground">{name.length}/20</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="settings-description">{t("Description")}</Label>
                  <Textarea
                    id="settings-description"
                    maxLength={50}
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={submitting || !allowDetails}
                  />
                  <p className="text-right text-2xs text-muted-foreground">{description.length}/50</p>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border p-4">
                  <div>
                    <p className="text-sm font-medium">{t("Open for Orders")}</p>
                    <p className="text-xs text-muted-foreground">{t("Customers can browse and buy")}</p>
                  </div>
                  <Switch
                    id="settings-open"
                    checked={open}
                    onCheckedChange={setOpen}
                    disabled={submitting || !allowStatus}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="settings-qr">{t("Payment QR Code")}</Label>
                    <span className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("Store Credential")}
                    </span>
                  </div>
                  <label
                    htmlFor={allowCredential ? "settings-qr" : undefined}
                    className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-5 transition-colors ${allowCredential ? "cursor-pointer hover:bg-muted/50" : "cursor-not-allowed opacity-60"
                      }`}
                  >
                    {qrPreview ? (
                      <div className="flex flex-col items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qrPreview} alt={t("Payment QR")} className="h-28 w-28 object-contain rounded-lg" />
                        <span className="text-xs text-muted-foreground">
                          {allowCredential
                            ? t("Click to change")
                            : t("Only the store master can change the payment QR")}
                        </span>
                      </div>
                    ) : (
                      <>
                        <UploadCloud className="size-7 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {allowCredential
                            ? t("Upload payment QR (PNG, JPG, max 2 MB)")
                            : t("Only the store master can change the payment QR")}
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
                    disabled={submitting || !allowCredential}
                  />
                </div>

                {canEditAnything && (
                  <div className="flex justify-end pt-2">
                    <Button
                      id="settings-save-btn"
                      type="submit"
                      disabled={!canSave}
                      className="w-full sm:w-auto"
                    >
                      {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                      {t("Save Changes")}
                    </Button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        </motion.div>

        {/* Kolom Kanan: Danger zone (master or store owner only) dalam Card */}
        {canDelete && (
          <motion.div {...entrance(0.12)} className="lg:col-span-5">
            <Card className="border-destructive/40 bg-destructive/5">
              <CardHeader>
                <CardTitle className="text-destructive">{t("Delete Store")}</CardTitle>
                <CardDescription>
                  {t("Delete this store? This cannot be undone.")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {confirmDelete ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-destructive">{t("Delete?")}</span>
                    <Button
                      id="settings-delete-store-confirm"
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => void handleDelete()}
                      disabled={deleting}
                    >
                      {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}
                      {t("Yes")}
                    </Button>
                    <Button
                      id="settings-delete-store-cancel"
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deleting}
                    >
                      {t("No")}
                    </Button>
                  </div>
                ) : (
                  <Button
                    id="settings-delete-store-btn"
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="gap-2"
                    onClick={() => setConfirmDelete(true)}
                    disabled={deleting}
                  >
                    <Trash2 className="size-4" />
                    {t("Delete Store")}
                  </Button>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  )
}

"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Package2,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

import { ItemDialog } from "@/components/quickstore/item-dialog"
import { Badge } from "@/components/ui/badge"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { StoreItem, StoreRole } from "@/lib/db/schema"
import { serverText, useTranslation } from "@/lib/i18n"
import {
  ITEM_AVAILABILITIES,
  ITEM_PAGE_SIZES,
  ITEM_SORT_KEYS,
  itemListApiParams,
  itemListUrlParams,
  parseItemListQuery,
  type ItemAvailability,
  type ItemListQuery,
  type ItemSortKey,
} from "@/lib/quickstore/item-list"
import { hasPermission } from "@/lib/quickstore/permissions"

interface Props {
  storeId: string
  role: StoreRole
}

/** What the paged items endpoint answers with. */
interface ItemsPage {
  items: StoreItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const SORT_LABELS = {
  name: "Name",
  price: "Price",
  stocks: "Stock",
  sold: "Sold",
  newest: "Newest",
} as const

const AVAILABILITY_LABELS = {
  all: "All",
  available: "Available only",
  unavailable: "Unavailable only",
} as const

const priceText = (item: StoreItem) =>
  item.currency === "IDR"
    ? `Rp ${Number(item.price).toLocaleString("id-ID")}`
    : `$${Number(item.price).toFixed(2)}`

export function ItemsTab({ storeId, role }: Props) {
  const { lang, t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // The URL is the single source of truth for the list state: every control
  // below writes back with `router.replace`, so a searched / sorted / paged
  // table is shareable and the browser's back button walks through it.
  const queryString = searchParams.toString()
  const query = useMemo(() => parseItemListQuery(new URLSearchParams(queryString)), [queryString])
  // Always-complete query for the request (`page` + `limit` included).
  const apiQuery = useMemo(() => itemListApiParams(query).toString(), [query])

  const [data, setData] = useState<ItemsPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  // The search box is local so typing stays instant; it is debounced into the URL.
  const [searchInput, setSearchInput] = useState(query.q)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<StoreItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<StoreItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Granular catalog permissions — a role may create without being able to
  // update or delete (and vice versa), so each control is gated separately.
  const canCreate = hasPermission(role, "item:create")
  const canUpdate = hasPermission(role, "item:update")
  const canDelete = hasPermission(role, "item:delete")

  /** Write a patch into the URL — callers reset `page` when the result set changes. */
  const updateQuery = useCallback(
    (patch: Partial<ItemListQuery>) => {
      const next = { ...parseItemListQuery(new URLSearchParams(queryString)), ...patch }
      const nextQuery = itemListUrlParams(next).toString()
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false })
    },
    [pathname, queryString, router]
  )

  // ── Fetching ───────────────────────────────────────────────────────────────
  // One request per page: the server searches, filters, sorts and counts, so a
  // store with thousands of items never ships its whole catalog to the browser.
  useEffect(() => {
    const controller = new AbortController()
    let active = true

    // eslint-disable-next-line react-hooks/set-state-in-effect -- request lifecycle
    setRefreshing(true)

    fetch(`/api/quickstore/stores/${storeId}/items?${apiQuery}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(payload.error ?? t("Failed to load items"))
        }
        return (await res.json()) as ItemsPage
      })
      .then((page) => {
        if (!active) return
        setData(page)
      })
      .catch((err: unknown) => {
        if (!active || (err instanceof DOMException && err.name === "AbortError")) return
        toast.error(err instanceof Error ? serverText(lang, err.message) : t("Failed to load items"))
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
        setRefreshing(false)
      })

    // Cancels the in-flight request when the query changes again (fast typing).
    return () => {
      active = false
      controller.abort()
    }
  }, [storeId, apiQuery, reloadToken, lang, t])

  // Keep the box in sync when the URL changes elsewhere (back button, reset).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchInput(query.q)
  }, [query.q])

  // Debounced search: typing always restarts from page 1.
  useEffect(() => {
    if (searchInput === query.q) return
    const id = setTimeout(() => updateQuery({ q: searchInput.trim(), page: 1 }), 350)
    return () => clearTimeout(id)
  }, [searchInput, query.q, updateQuery])

  // A shared link can point past the last page; the API answers the last real
  // page, so mirror it back and the URL and the pager can never disagree.
  useEffect(() => {
    if (!data || data.total === 0 || data.page === query.page) return
    updateQuery({ page: data.page })
  }, [data, query.page, updateQuery])

  // ── Row actions ────────────────────────────────────────────────────────────
  const openCreate = () => {
    setEditingItem(null)
    setDialogOpen(true)
  }

  const openEdit = (item: StoreItem) => {
    setEditingItem(item)
    setDialogOpen(true)
  }

  const handleSaved = (saved: StoreItem) => {
    toast.success(editingItem ? t("Item updated") : t('"{name}" added', { name: saved.name }))
    // Re-reads the page, so the pager and the counts stay truthful.
    setReloadToken((token) => token + 1)
  }

  const handleDelete = async () => {
    const item = deleteTarget
    if (!item || deleting) return

    setDeleting(true)
    try {
      const res = await fetch(`/api/quickstore/stores/${storeId}/items/${item.id}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error ?? t("Delete failed"))
      }
      toast.success(t('"{name}" deleted', { name: item.name }))
      setDeleteTarget(null)

      // Emptying the last row of a page would otherwise leave a blank page.
      if (data && data.items.length === 1 && data.page > 1) {
        updateQuery({ page: data.page - 1 })
      } else {
        setReloadToken((token) => token + 1)
      }
    } catch (err) {
      toast.error(err instanceof Error ? serverText(lang, err.message) : t("Delete failed"))
    } finally {
      setDeleting(false)
    }
  }

  const clearFilters = () => {
    setSearchInput("")
    updateQuery({ q: "", availability: "all", page: 1 })
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1
  const currentPage = data?.page ?? 1
  const from = total === 0 ? 0 : (currentPage - 1) * (data?.pageSize ?? 0) + 1
  const to = Math.min(currentPage * (data?.pageSize ?? 0), total)
  const narrowed = query.q !== "" || query.availability !== "all"

  return (
    <div className="space-y-4">
      {/*
       * Toolbar — mobile first: the search takes the full width on a phone (with
       * the add button as an icon next to it) and the filters wrap underneath.
       */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="items-search"
            type="search"
            className="pl-8"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("Search items…")}
            aria-label={t("Search items…")}
          />
        </div>

        {canCreate && (
          <Button id="add-item-btn" className="gap-1.5" onClick={openCreate} aria-label={t("Add Item")}>
            <Plus className="size-4" />
            <span className="hidden sm:inline">{t("Add Item")}</span>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={query.availability}
          onValueChange={(value) =>
            updateQuery({ availability: value as ItemAvailability, page: 1 })
          }
        >
          <SelectTrigger
            id="items-availability"
            size="sm"
            className="min-w-[8.5rem] flex-1 sm:flex-none"
            aria-label={t("Availability")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ITEM_AVAILABILITIES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(AVAILABILITY_LABELS[value])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={query.sort}
          onValueChange={(value) => updateQuery({ sort: value as ItemSortKey, page: 1 })}
        >
          <SelectTrigger
            id="items-sort"
            size="sm"
            className="min-w-[8.5rem] flex-1 sm:flex-none"
            aria-label={t("Sort by")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ITEM_SORT_KEYS.map((value) => (
              <SelectItem key={value} value={value}>
                {t(SORT_LABELS[value])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          id="items-sort-dir"
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          aria-label={query.dir === "asc" ? t("Ascending") : t("Descending")}
          onClick={() => updateQuery({ dir: query.dir === "asc" ? "desc" : "asc", page: 1 })}
        >
          {query.dir === "asc" ? (
            <ArrowUp className="size-3.5" />
          ) : (
            <ArrowDown className="size-3.5" />
          )}
          <span className="hidden sm:inline">
            {query.dir === "asc" ? t("Ascending") : t("Descending")}
          </span>
        </Button>

        {refreshing && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center border border-dashed border-border bg-card py-16 text-center">
          <Package2 className="mb-3 size-10 text-muted-foreground/50" />
          {narrowed ? (
            <>
              <p className="font-semibold">{t("No items match your filters")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("Try a different search or reset the filters.")}
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                {t("Clear filters")}
              </Button>
            </>
          ) : (
            <>
              <p className="font-semibold">{t("No items yet")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {canCreate ? t("Add your first item to get started.") : t("No items have been added.")}
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          {/*
           * Table — the primitive keeps its own horizontal scroll for very small
           * screens, while the secondary columns fold into the first cell below
           * their breakpoint so a phone still reads as one clean column.
           */}
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-full min-w-[10rem]">{t("Items")}</TableHead>
                  <TableHead className="text-right">{t("Price")}</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">{t("Stock")}</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">{t("Sold")}</TableHead>
                  <TableHead className="text-right">{t("Actions")}</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id} id={`item-row-${item.id}`}>
                    <TableCell className="w-full whitespace-normal">
                      <div className="flex items-start gap-2">
                        {item.highlight && (
                          <Star
                            className="mt-0.5 size-3.5 shrink-0 fill-amber-400 text-amber-400"
                            aria-label={t("Pinned")}
                          />
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-foreground">{item.name}</p>
                          {item.description && (
                            <p className="line-clamp-2 text-2xs text-muted-foreground">
                              {item.description}
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge
                              variant={item.available ? "default" : "secondary"}
                              className="text-3xs"
                            >
                              {item.available ? t("Available") : t("Unavailable")}
                            </Badge>
                            {/* Phone only: stock + sold would cost two columns. */}
                            <span className="text-2xs text-muted-foreground sm:hidden">
                              {item.stocks != null
                                ? t("{count} in stock", { count: item.stocks })
                                : t("Unlimited stock")}
                              {" · "}
                              {t("{count} sold", { count: item.purchasedAmount })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell className="text-right">
                      <span className="font-semibold text-primary tabular-nums">
                        {priceText(item)}
                      </span>
                      {item.discountPercent > 0 && (
                        <Badge variant="secondary" className="ml-1.5 text-3xs">
                          -{item.discountPercent}%
                        </Badge>
                      )}
                    </TableCell>

                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {item.stocks != null ? item.stocks : "∞"}
                    </TableCell>

                    <TableCell className="hidden text-right tabular-nums lg:table-cell">
                      {item.purchasedAmount}
                    </TableCell>

                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canUpdate && (
                          <Button
                            id={`edit-item-${item.id}`}
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t("Edit item")}
                            onClick={() => openEdit(item)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            id={`delete-item-${item.id}`}
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            aria-label={t("Delete item")}
                            onClick={() => setDeleteTarget(item)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pager — stacked on a phone, a single line from `sm` up. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {t("{from}–{to} of {total}", { from, to, total })}
            </p>

            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <Select
                value={String(query.pageSize)}
                onValueChange={(value) => updateQuery({ pageSize: Number(value), page: 1 })}
              >
                <SelectTrigger
                  id="items-page-size"
                  size="sm"
                  className="min-w-[7.5rem]"
                  aria-label={t("Rows per page")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ITEM_PAGE_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {t("{count} per page", { count: size })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-1">
                <Button
                  id="items-prev-page"
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("Previous")}
                  disabled={currentPage <= 1 || refreshing}
                  onClick={() => updateQuery({ page: currentPage - 1 })}
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <span className="px-1 text-xs tabular-nums text-muted-foreground">
                  {t("Page {page} of {pages}", { page: currentPage, pages: totalPages })}
                </span>
                <Button
                  id="items-next-page"
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("Next")}
                  disabled={currentPage >= totalPages || refreshing}
                  onClick={() => updateQuery({ page: currentPage + 1 })}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      <ItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        storeId={storeId}
        item={editingItem}
        onSaved={handleSaved}
      />

      {/* Delete confirmation — a row disappears for good, so never in one click. */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null)
        }}
      >
        <DialogContent className="max-w-[calc(100%-3rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-bold">{t("Delete Item")}</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? t('Delete "{name}"? This cannot be undone.', { name: deleteTarget.name })
                : ""}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              {t("Cancel")}
            </Button>
            <Button
              id="item-delete-confirm"
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t("Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


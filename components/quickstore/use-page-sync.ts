"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/** The paging slice every list payload carries (`ItemsPage`, `HistoryPage`, …). */
interface PagedPayload {
  /** The page the server actually answered — it clamps a page past the end. */
  page: number
  total: number
}

interface PageSync {
  /** Call right after committing a payload: it is the answer to `apiQuery`. */
  markLoaded: (apiQuery: string) => void
  /** True while the rows on screen were NOT produced by the URL's request. */
  stale: boolean
}

/**
 * Keeps a paged list and the URL in step. Two jobs:
 *
 * 1. **Say whether the rows on screen are stale.** Changing the page keeps the
 *    previous rows until the new payload lands (no flash of an empty table), so
 *    the caller can dim them and already label the page the URL asks for.
 * 2. **Mirror a server-clamped page back into the URL.** A shared link can point
 *    past the last page; the API answers the last real page instead, and the URL
 *    is corrected so the pager and the address bar can never disagree.
 *
 * The mirror only runs when the payload on screen answers the request the URL
 * currently asks for — hence `markLoaded(apiQuery)` on every commit. Without that
 * guard the still-visible payload of the previous page would be mirrored back and
 * undo the navigation the operator just asked for: the classic "click Next and
 * land on page 1 again" (`page 1` payload, `page 2` URL → rewrite back to 1,
 * which also aborts the in-flight request for page 2).
 *
 * `onClamped` may be a fresh lambda on every render; only the latest one is used.
 */
export function usePageSync(
  apiQuery: string,
  requestedPage: number,
  payload: PagedPayload | null,
  onClamped: (page: number) => void
): PageSync {
  // `apiQuery` of the request whose payload is currently on screen.
  const [answeredQuery, setAnsweredQuery] = useState<string | null>(null)
  const handler = useRef(onClamped)

  useEffect(() => {
    handler.current = onClamped
  })

  useEffect(() => {
    // Stale payload (a newer request is still in flight) → never touch the URL.
    if (!payload || answeredQuery !== apiQuery) return
    // `total === 0` renders the empty state, there is nothing to page to.
    if (payload.total === 0 || payload.page === requestedPage) return
    handler.current(payload.page)
  }, [payload, answeredQuery, apiQuery, requestedPage])

  const markLoaded = useCallback((query: string) => setAnsweredQuery(query), [])

  // `false` until the first payload arrives: the caller shows its own spinner then.
  return { markLoaded, stale: answeredQuery !== null && answeredQuery !== apiQuery }
}

"use server"

/**
 * QuickStore — voice order interpretation.
 *
 * Direct port of `POST /api/quickstore/stores/[storeId]/voice`:
 *   - validates the session + `sale:create` (this feeds the cashier)
 *   - loads the store catalog server-side (the client never dictates it)
 *   - asks OpenRouter (free models router) for a strict JSON order
 *   - maps the answer back onto real catalog rows (raw model ids are untrusted)
 *
 * `data.status` stays `"ok" | "undetected"` exactly as before, so the review /
 * "nothing detected" screen keeps working unchanged; the failures travel in the
 * envelope (`error` + `code`).
 */
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { storeItems } from "@/lib/db/schema"
import { chatCompletion } from "@/lib/openrouter"
import { hasPermission } from "@/lib/quickstore/permissions"
import { getUserRole } from "@/lib/quickstore/queries"
import {
  buildVoiceOrderUserMessage,
  extractJsonObject,
  isVoiceLanguage,
  mapVoiceOrderResult,
  VOICE_MAX_TRANSCRIPT_CHARS,
  VOICE_ORDER_SYSTEM_PROMPT,
  type VoiceLanguage,
  type VoiceOrderResult,
} from "@/lib/quickstore/voice-order"
import { currentSession } from "./context"
import { fail, ok, type ActionResult } from "./result"
import { jsonSafe } from "./serialize"

export async function interpretVoiceOrder(
  storeId: string,
  transcript: string,
  language: VoiceLanguage
): Promise<ActionResult<VoiceOrderResult>> {
  const session = await currentSession()
  if (!session) return fail("Unauthorized", { status: 401 })

  const role = await getUserRole(session.userId, storeId)
  // Voice input creates cart lines, so it requires the same right as the cart.
  if (!hasPermission(role, "sale:create")) return fail("Forbidden", { status: 403 })

  if (!isVoiceLanguage(language)) {
    return fail("language must be 'EN' or 'ID'", { status: 400, code: "INVALID_REQUEST" })
  }
  if (typeof transcript !== "string") {
    return fail("transcript is required", { status: 400, code: "INVALID_REQUEST" })
  }

  const spoken = transcript.trim().slice(0, VOICE_MAX_TRANSCRIPT_CHARS)
  if (spoken === "") {
    return fail("Nothing was heard, please try again", { status: 400, code: "EMPTY_TRANSCRIPT" })
  }

  // The catalog is the single source of truth — and the interpreter's context.
  const rows = await db.query.storeItems.findMany({
    where: eq(storeItems.storeId, storeId),
    columns: { id: true, name: true, description: true },
    orderBy: (i, { asc }) => [asc(i.name)],
  })
  const catalog = rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
  }))

  if (catalog.length === 0) {
    return fail("This store has no items to order yet", { status: 400, code: "NO_CATALOG" })
  }

  // "openrouter/free" picks a random free model per request; a flaky one can
  // answer with empty text or prose. One retry keeps the feature reliable.
  const MAX_ATTEMPTS = 2
  let parsed: unknown = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS && parsed === null; attempt += 1) {
    try {
      const { content } = await chatCompletion([
        { role: "system", content: VOICE_ORDER_SYSTEM_PROMPT },
        { role: "user", content: buildVoiceOrderUserMessage(spoken, language, catalog) },
      ])

      parsed = extractJsonObject(content)
      if (!parsed) {
        // console.error(
        //   `[quickstore/voice] attempt ${attempt} returned non-JSON:`,
        //   content.slice(0, 200)
        // )
      }
    } catch {
      // console.error(`[quickstore/voice] attempt ${attempt} failed`, error)
    }
  }

  if (!parsed) {
    return fail("Could not understand the order, please try again", {
      status: 502,
      code: "OPENROUTER_FAILED",
    })
  }

  // Validation happens here: unknown ids are dropped, never trusted.
  return ok(jsonSafe(mapVoiceOrderResult(parsed, catalog, spoken, language)))
}
/**
 * POST /api/quickstore/stores/[storeId]/voice
 *
 * Turns a spoken sentence (browser speech-to-text transcript) into validated
 * order lines for THIS store:
 *   - validates the session + `sale:create` (this endpoint feeds the cashier)
 *   - loads the store catalog server-side (the client never dictates it)
 *   - asks OpenRouter (free models router) for a strict JSON order
 *   - maps the answer back onto real catalog rows (raw model ids are untrusted)
 *
 * Responses:
 *   200 `{ status: "ok" | "undetected", lines, unmatched, ... }`
 *   400 `{ status: "error", code: "INVALID_REQUEST" | "EMPTY_TRANSCRIPT" | "NO_CATALOG" }`
 *   401/403 permission errors
 *   502 `{ status: "error", code: "OPENROUTER_FAILED" }`
 */
import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { authOptions } from "@/lib/auth"
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
  type VoiceOrderFailure,
} from "@/lib/quickstore/voice-order"

export const runtime = "nodejs"

type Params = { params: Promise<{ storeId: string }> }

/** Uniform failure payload — the frontend switches on `status === "error"`. */
function voiceError(
  error: string,
  code: NonNullable<VoiceOrderFailure["code"]>,
  status: number
) {
  return NextResponse.json(
    { status: "error", error, code } satisfies VoiceOrderFailure,
    { status }
  )
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { storeId } = await params
  const role = await getUserRole(session.user.id, storeId)
  // Voice input creates cart lines, so it requires the same right as the cart.
  if (!hasPermission(role, "sale:create")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return voiceError("Invalid JSON body", "INVALID_REQUEST", 400)
  }

  const { transcript, language } = (body ?? {}) as Record<string, unknown>
  if (!isVoiceLanguage(language)) {
    return voiceError("language must be 'EN' or 'ID'", "INVALID_REQUEST", 400)
  }
  if (typeof transcript !== "string") {
    return voiceError("transcript is required", "INVALID_REQUEST", 400)
  }

  const spoken = transcript.trim().slice(0, VOICE_MAX_TRANSCRIPT_CHARS)
  if (spoken === "") {
    return voiceError("Nothing was heard, please try again", "EMPTY_TRANSCRIPT", 400)
  }

  // The catalog is the single source of truth — and the interpreter's context.
  const rows = await db.query.storeItems.findMany({
    where: eq(storeItems.storeId, storeId),
    columns: { id: true, name: true, description: true },
    orderBy: (i, { desc, asc }) => [desc(i.highlight), asc(i.name)],
  })
  const catalog = rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
  }))

  if (catalog.length === 0) {
    return voiceError("This store has no items to order yet", "NO_CATALOG", 400)
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
        console.error(
          `[quickstore/voice] attempt ${attempt} returned non-JSON:`,
          content.slice(0, 200)
        )
      }
    } catch (error) {
      console.error(`[quickstore/voice] attempt ${attempt} failed`, error)
    }
  }

  if (!parsed) {
    return voiceError("Could not understand the order, please try again", "OPENROUTER_FAILED", 502)
  }

  // Validation happens here: unknown ids are dropped, never trusted.
  return NextResponse.json(mapVoiceOrderResult(parsed, catalog, spoken, language))
}

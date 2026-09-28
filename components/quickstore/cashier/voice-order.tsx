"use client"

import { cn } from "cn"
import { ChevronDown, Loader2, Mic, Plus, Square, TriangleAlert, X } from "lucide-react"
import { useCallback, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { availabilityMessage, serverText, useTranslation, type TranslationKey } from "@/lib/i18n"
import {
  MAX_QTY_PER_LINE,
  checkAvailability,
  formatCents,
  toCents,
  type CashierItem,
} from "@/lib/quickstore/cashier"
import { useSpeechRecognition, type SpeechErrorCode } from "@/lib/quickstore/speech"
import {
  VOICE_LANGUAGE_LABEL,
  VOICE_SPEECH_LOCALE,
  isVoiceOrderFailure,
  type VoiceLanguage,
  type VoiceOrderApiResponse,
  type VoiceOrderResult,
} from "@/lib/quickstore/voice-order"

interface Props {
  storeId: string
  items: readonly CashierItem[]
  /** Called with the reviewed lines once the cashier confirms. */
  onAdd: (lines: readonly { item: CashierItem; quantity: number }[]) => void
  disabled?: boolean
}

type Phase = "idle" | "listening" | "stopping" | "parsing" | "review"

/** Microphone failures, in the cashier's language. */
const SPEECH_ERROR_PHRASE: Record<SpeechErrorCode, TranslationKey> = {
  not_supported: "Voice input is not supported in this browser. Use Chrome or Edge.",
  not_allowed: "Microphone access was blocked. Allow it in your browser, then try again.",
  no_microphone: "No microphone was found on this device.",
  no_speech: "Nothing was heard. Please try again.",
  network: "The speech service is unreachable. Check your connection.",
  aborted: "Listening was stopped.",
  unknown: "Voice input failed. Please try again.",
}

/**
 * Voice order entry for the cashier.
 *
 *   speech → strict-JSON interpretation → review list → Add to sale
 *
 * The panel stays stateless about the cart: it only hands validated
 * `{ item, quantity }` pairs to `onAdd`, exactly like the autocomplete hands
 * over the picked product. Controls are disabled while the microphone or a
 * request is in flight, so a line can never be added twice.
 */
export function VoiceOrder({ storeId, items, onAdd, disabled = false }: Props) {
  const { lang, t } = useTranslation()

  // Independent from the UI language: the cashier explicitly picks the spoken
  // language here (it also drives the speech engine's locale).
  const [language, setLanguage] = useState<VoiceLanguage>("EN")
  const [phase, setPhase] = useState<Phase>("idle")
  const [result, setResult] = useState<VoiceOrderResult | null>(null)
  const [errorText, setErrorText] = useState<string | null>(null)
  // Voice is optional: the panel stays a single row until the cashier opens it.
  const [open, setOpen] = useState(false)
  const stoppingRef = useRef(false)

  const speech = useSpeechRecognition(VOICE_SPEECH_LOCALE[language])

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  const busy = phase === "stopping" || phase === "parsing"
  // The engine can end on its own (silence, error): keep the transcript and let
  // the cashier press the mic again to interpret it instead of losing it.
  const listening = phase === "listening" && speech.listening
  const captured = phase === "listening" && !speech.listening && speech.transcript.trim() !== ""
  const unitsToAdd = useMemo(
    () => result?.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0,
    [result]
  )
  const micErrorText =
    speech.error && speech.error !== "aborted" ? t(SPEECH_ERROR_PHRASE[speech.error]) : null

  // ── Interpretation ─────────────────────────────────────────────────────────
  /** Send the transcript to our strict-JSON interpreter and show the review. */
  const interpret = useCallback(
    async (spoken: string) => {
      setErrorText(null)

      if (spoken.trim() === "") {
        setResult(null)
        setPhase("idle")
        setErrorText(t("Nothing was heard. Please try again."))
        return
      }

      setPhase("parsing")
      try {
        const res = await fetch(`/api/quickstore/stores/${storeId}/voice`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: spoken, language }),
        })
        const payload = (await res.json().catch(() => null)) as VoiceOrderApiResponse | null

        if (!payload || isVoiceOrderFailure(payload)) {
          setResult(null)
          setPhase("idle")
          setErrorText(
            serverText(lang, payload?.error ?? "Voice interpretation failed, please try again")
          )
          return
        }

        setResult(payload)
        if (payload.status === "ok") {
          setPhase("review")
          return
        }

        setPhase("idle")
        setErrorText(
          t("No matching item was detected in this store. Try saying the product name again.")
        )
      } catch {
        setResult(null)
        setPhase("idle")
        setErrorText(serverText(lang, "Voice interpretation failed, please try again"))
      }
    },
    [lang, language, storeId, t]
  )

  // ── Microphone ─────────────────────────────────────────────────────────────
  const handleMic = useCallback(async () => {
    // Guarded by a ref as well as by state: a fast double click cannot stop twice.
    if (phase === "listening") {
      if (stoppingRef.current) return
      stoppingRef.current = true
      setPhase("stopping")
      const spoken = await speech.stop()
      stoppingRef.current = false
      await interpret(spoken)
      return
    }

    if (busy) return

    setResult(null)
    setErrorText(null)
    speech.reset()
    setPhase(speech.start() ? "listening" : "idle")
  }, [busy, interpret, phase, speech])

  const handleConfirm = useCallback(() => {
    if (!result || result.lines.length === 0 || busy) return

    const picked = result.lines
      .map((line) => ({ item: itemsById.get(line.itemId), quantity: line.quantity }))
      .filter((entry): entry is { item: CashierItem; quantity: number } => Boolean(entry.item))

    if (picked.length === 0) {
      setResult(null)
      setPhase("idle")
      setErrorText(t("Those products are no longer in this store. Refresh the catalog."))
      return
    }

    onAdd(picked)
    setResult(null)
    setPhase("idle")
    speech.reset()
  }, [busy, itemsById, onAdd, result, speech, t])

  const handleDiscard = useCallback(() => {
    if (busy) return
    setResult(null)
    setErrorText(null)
    setPhase("idle")
    speech.reset()
  },
    [busy, speech]
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <section className="overflow-hidden border border-primary/30 bg-card">
      {/* Collapsed by default: voice takes one row until the cashier opens it. */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls="voice-order-body"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full cursor-pointer items-center gap-2.5 bg-primary/5 px-3.5 py-3 text-left transition-colors hover:bg-primary/10"
      >
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full",
            listening
              ? "animate-pulse bg-destructive/10 text-destructive"
              : "bg-primary text-primary-foreground shadow-sm"
          )}
        >
          <Mic className="size-4" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate text-sm font-semibold text-foreground">
              {t("Voice order")}
            </span>
            {!listening && (
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-3xs font-medium text-primary">
                {t("Tap to speak")}
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-2xs text-muted-foreground">
            {listening
              ? speech.transcript || t("Listening…")
              : t('Say e.g. "three pencils, four pens".')}
          </span>
        </span>

        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-primary transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      <div
        id="voice-order-body"
        className={cn("space-y-3 border-t border-border p-3", !open && "hidden")}
      >
        {/* Spoken language — it also drives the speech engine's locale. */}
        <div className="flex items-center justify-end gap-2">
          <span className="text-2xs text-muted-foreground">{t("Language")}</span>
          <Select
            value={language}
            onValueChange={(value) => setLanguage(value as VoiceLanguage)}
            disabled={busy || listening || captured}
          >
            <SelectTrigger size="sm" aria-label={t("Voice language")} className="h-7 gap-1.5 text-xs">
              <SelectValue>{VOICE_LANGUAGE_LABEL[language]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EN">{VOICE_LANGUAGE_LABEL.EN}</SelectItem>
              <SelectItem value="ID">{VOICE_LANGUAGE_LABEL.ID}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Mic row */}
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant={listening ? "destructive" : "outline"}
            size="icon-lg"
            className={cn("shrink-0 rounded-full", listening && "animate-pulse")}
            aria-label={listening ? t("Stop and interpret") : t("Start voice order")}
            onClick={() => void handleMic()}
            disabled={disabled || !speech.supported || busy}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : listening ? (
              <Square className="size-4" />
            ) : (
              <Mic className="size-4" />
            )}
          </Button>

          <div className="min-w-0 flex-1">
            {listening ? (
              <p className="text-sm">
                <span className="font-medium">{speech.transcript || t("Listening…")}</span>{" "}
                <span className="text-muted-foreground">{speech.interim}</span>
              </p>
            ) : busy ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                {t("Interpreting the order…")}
              </p>
            ) : captured ? (
              <p className="text-sm">
                <span className="font-medium">{speech.transcript}</span>{" "}
                <span className="text-muted-foreground">
                  {t("Press the mic to interpret it.")}
                </span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('Say e.g. "three pencils, four pens".')}
              </p>
            )}
          </div>

          {result || errorText ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              aria-label={t("Discard")}
              onClick={handleDiscard}
              disabled={busy}
            >
              <X className="size-3.5" />
            </Button>
          ) : null}
        </div>

        {!speech.supported ? (
          <p className="text-2xs text-muted-foreground">{t(SPEECH_ERROR_PHRASE.not_supported)}</p>
        ) : null}

        {errorText || micErrorText ? (
          <p
            role="alert"
            className="flex items-start gap-2 border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive"
          >
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>{errorText ?? micErrorText}</span>
          </p>
        ) : null}

        {/* Review: nothing reaches the cart before this confirmation */}
        {result && result.lines.length > 0 ? (
          <div className="space-y-2">
            <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Detected items")} · “{result.transcript}”
            </p>

            <ul className="divide-y divide-border border border-border">
              {result.lines.map((line) => {
                const item = itemsById.get(line.itemId)
                if (!item) return null
                const availability = checkAvailability(item, line.quantity)
                return (
                  <li key={line.itemId} className="flex items-center gap-2 px-2.5 py-2">
                    <span className="w-9 shrink-0 text-center text-sm font-bold tabular-nums">
                      {line.quantity}×
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.name}</span>
                      <span
                        className={cn(
                          "block text-2xs",
                          availability.ok ? "text-muted-foreground" : "text-destructive"
                        )}
                      >
                        {availability.ok
                          ? t("{price} each", {
                            price: formatCents(toCents(item.price)),
                          })
                          : availabilityMessage(lang, availability.code, availability.message, {
                            name: item.name,
                            stocks: availability.orderable ?? 0,
                            max: MAX_QTY_PER_LINE,
                          })}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {formatCents(toCents(item.price) * line.quantity)}
                    </span>
                  </li>
                )
              })}
            </ul>

            {result.unmatched.length > 0 ? (
              <ul className="space-y-1 text-2xs text-muted-foreground">
                {result.unmatched.map((entry) => (
                  <li key={entry.heard} className="flex items-start gap-1.5">
                    <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                    {t('Not in this store: "{heard}"', { heard: entry.heard })}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                className="flex-1 gap-1.5"
                onClick={handleConfirm}
                disabled={busy || unitsToAdd === 0}
              >
                <Plus className="size-3.5" />
                {t("Add {count} to sale", { count: unitsToAdd })}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={handleDiscard} disabled={busy}>
                {t("Cancel")}
              </Button>
            </div>
          </div>
        ) : null}

      </div>
    </section>
  )
}

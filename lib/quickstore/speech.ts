/**
 * Free voice-to-text for the QuickStore cashier.
 *
 * Uses the browser-native Web Speech API (`SpeechRecognition` /
 * `webkitSpeechRecognition`) — no npm package, no API key, no server round-trip
 * for the transcription itself. Supported by Chrome, Edge and Safari; the hook
 * reports `supported: false` elsewhere so the UI can disable the mic.
 *
 * Flow used by the cashier: `start()` → keep talking → `stop()` resolves with
 * the FINAL transcript once the engine has flushed its last results, which is
 * then sent to our OpenRouter endpoint for interpretation.
 *
 * The transcript is rebuilt from the whole `results` snapshot on every event
 * (never appended) and passed through `collapseRepeats`, because several engines
 * — Chrome on Android above all — re-deliver a result they already sent, which
 * used to arrive as "satu tahu satu tahu" for one spoken "satu tahu".
 *
 * CLIENT ONLY — import from client components (it touches `window`).
 */
import { useCallback, useEffect, useRef, useState } from "react"

// ─────────────────────────────────────────────────────────────────────────────
// Minimal Web Speech API typings (not part of lib.dom on every TS version)
// ─────────────────────────────────────────────────────────────────────────────

interface SpeechAlternativeLike {
  transcript: string
  confidence: number
}

interface SpeechResultLike {
  isFinal: boolean
  length: number
  [index: number]: SpeechAlternativeLike
}

interface SpeechResultListLike {
  length: number
  [index: number]: SpeechResultLike
}

interface SpeechResultEventLike {
  resultIndex: number
  results: SpeechResultListLike
}

interface SpeechErrorEventLike {
  error: string
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onstart: (() => void) | null
  onend: (() => void) | null
  onresult: ((event: SpeechResultEventLike) => void) | null
  onerror: ((event: SpeechErrorEventLike) => void) | null
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

// ─────────────────────────────────────────────────────────────────────────────
// Public surface
// ─────────────────────────────────────────────────────────────────────────────

/** Normalised failure codes the UI can translate. */
export type SpeechErrorCode =
  | "not_supported"
  | "not_allowed"
  | "no_microphone"
  | "no_speech"
  | "network"
  | "aborted"
  | "unknown"

/** Safety net: never hang forever waiting for the engine's `onend`. */
export const SPEECH_STOP_TIMEOUT_MS = 2500

export interface SpeechRecognitionState {
  supported: boolean
  listening: boolean
  /** Final (already recognised) text. */
  transcript: string
  /** Still-being-recognised text — shown while listening. */
  interim: string
  error: SpeechErrorCode | null
  /** Starts listening. Returns false when the microphone could not be opened. */
  start: () => boolean
  /** Stops listening and resolves with the final transcript. */
  stop: () => Promise<string>
  /** Aborts, clears the transcript and any error. */
  reset: () => void
}

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

function mapSpeechError(error: string): SpeechErrorCode {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "not_allowed"
    case "audio-capture":
      return "no_microphone"
    case "no-speech":
      return "no_speech"
    case "network":
      return "network"
    case "aborted":
      return "aborted"
    default:
      return "unknown"
  }
}

/**
 * Collapses an immediately repeated word sequence, because several engines
 * (notably Chrome on Android) deliver one utterance twice — once as an interim
 * result and once as a final one, or as two identical final results:
 *
 *   "satu tahu satu tahu"             → "satu tahu"
 *   "dua tahu dua tahu dua tahu"      → "dua tahu"
 *   "one potato one potato"           → "one potato"
 *
 * Pure and exported so it can be unit-tested without a browser.
 */
export function collapseRepeats(text: string, maxWords = 8): string {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length < 2) return words.join(" ")

  let changed = true
  while (changed && words.length > 1) {
    changed = false

    for (let size = Math.min(maxWords, Math.floor(words.length / 2)); size >= 1; size -= 1) {
      for (let start = 0; start + size * 2 <= words.length; start += 1) {
        const first = words.slice(start, start + size).join(" ").toLowerCase()
        const second = words.slice(start + size, start + size * 2).join(" ").toLowerCase()
        if (first !== second) continue

        words.splice(start + size, size)
        changed = true
        break
      }
      if (changed) break
    }
  }

  return words.join(" ")
}

/**
 * The part of an interim transcript that is genuinely new. On some devices the
 * engine repeats the finalized words inside the interim result, which made the
 * panel read "satu tahu satu tahu" (and sent the duplicate to the interpreter).
 */
export function interimTail(interim: string, final: string): string {
  if (interim === "") return ""
  if (final === "") return interim

  const heard = interim.toLowerCase()
  const settled = final.toLowerCase()
  if (heard === settled) return ""
  if (heard.startsWith(settled)) return interim.slice(final.length).trim()

  return interim
}

/**
 * @param locale BCP-47 locale of the recognition engine, e.g. "id-ID".
 */
export function useSpeechRecognition(locale: string): SpeechRecognitionState {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [interim, setInterim] = useState("")
  const [error, setError] = useState<SpeechErrorCode | null>(null)

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const finalRef = useRef("")
  const listeningRef = useRef(false)
  const stopResolveRef = useRef<((text: string) => void) | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const unmountedRef = useRef(false)

  // Feature detection runs after mount so the server and the first client
  // render stay identical (no hydration mismatch on `supported`).
  useEffect(() => {
    // A remount (React Strict Mode in dev, Fast Refresh) runs the cleanup of the
    // previous mount first, which sets the flag below — reset it here, or the
    // guard would silence every later state update for the rest of the session.
    unmountedRef.current = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(getRecognitionCtor() !== null)
    return () => {
      unmountedRef.current = true
    }
  }, [])

  const settleStop = useCallback((text: string) => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    const resolve = stopResolveRef.current
    stopResolveRef.current = null
    resolve?.(text)
  }, [])

  const start = useCallback((): boolean => {
    if (listeningRef.current) return true

    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      setError("not_supported")
      return false
    }

    finalRef.current = ""
    setTranscript("")
    setInterim("")
    setError(null)

    const recognition = new Ctor()
    recognition.lang = locale
    // Continuous + interim: cashiers speak whole orders ("tiga pensil, empat pena").
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      // Rebuild from the WHOLE results snapshot instead of appending to the last
      // one. Mobile Chrome re-delivers finalized results (resultIndex back to 0,
      // or the same final twice), so appending turned a single "satu tahu" into
      // "satu tahu satu tahu". A rebuild is idempotent: replaying an event can
      // never duplicate text.
      let final = ""
      let pending = ""

      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index]
        const alternative = result?.[0]
        if (!alternative) continue

        const text = alternative.transcript.trim()
        if (text === "") continue

        if (result.isFinal) final = `${final} ${text}`.trim()
        else pending = `${pending} ${text}`.trim()
      }

      const spoken = collapseRepeats(final)
      finalRef.current = spoken

      // Always push what was heard to the UI: the cashier must see their own
      // words, and a state update after unmount is a harmless no-op in React.
      setTranscript(spoken)
      // The engine repeats the settled words inside the interim result on some
      // devices — never show (or interpret) them twice.
      setInterim(interimTail(pending, spoken))
    }

    recognition.onerror = (event) => {
      if (unmountedRef.current) return
      setError(mapSpeechError(event.error))
      // The engine follows every error with `onend`, which settles `stop()`.
    }

    recognition.onend = () => {
      const text = finalRef.current
      listeningRef.current = false
      if (!unmountedRef.current) {
        setListening(false)
        setInterim("")
      }
      settleStop(text)
    }

    try {
      recognition.start()
    } catch {
      setError("unknown")
      return false
    }

    recognitionRef.current = recognition
    listeningRef.current = true
    setListening(true)
    return true
  }, [locale, settleStop])

  const stop = useCallback((): Promise<string> => {
    const recognition = recognitionRef.current
    if (!recognition || !listeningRef.current) return Promise.resolve(finalRef.current)

    return new Promise<string>((resolve) => {
      stopResolveRef.current = resolve
      // Some engines never fire `onend` (tab switch, silent track): settle anyway.
      timeoutRef.current = window.setTimeout(
        () => settleStop(finalRef.current),
        SPEECH_STOP_TIMEOUT_MS
      )
      try {
        recognition.stop()
      } catch {
        settleStop(finalRef.current)
      }
    })
  }, [settleStop])

  const reset = useCallback(() => {
    const recognition = recognitionRef.current
    recognitionRef.current = null
    listeningRef.current = false
    finalRef.current = ""
    settleStop("")
    try {
      recognition?.abort()
    } catch {
      // already stopped
    }
    setListening(false)
    setTranscript("")
    setInterim("")
    setError(null)
  }, [settleStop])

  return { supported, listening, transcript, interim, error, start, stop, reset }
}

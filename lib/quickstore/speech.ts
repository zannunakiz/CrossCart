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
      let pending = ""
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const alternative = result?.[0]
        if (!alternative) continue
        if (result.isFinal) {
          finalRef.current = `${finalRef.current} ${alternative.transcript}`.trim()
        } else {
          pending = `${pending} ${alternative.transcript}`.trim()
        }
      }
      setTranscript(finalRef.current)
      setInterim(pending)
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

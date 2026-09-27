"use client"

import jsQR from "jsqr"
import { Loader2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useLanguage } from "@/lib/i18n"

/**
 * Camera QR scanner for the cashier. Decodes customer order QRs in place and
 * hands the raw payload back — the caller decides how to parse it.
 */
export function QrCameraScanner({
  open,
  onOpenChange,
  onResult,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onResult: (text: string) => void
}) {
  const lang = useLanguage()
  const id = lang === "ID"
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const resultRef = useRef(onResult)
  const [starting, setStarting] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    resultRef.current = onResult
  }, [onResult])

  useEffect(() => {
    if (!open) return
    let cancelled = false

    const stop = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = null
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    const scan = () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      const context = canvas?.getContext("2d", { willReadFrequently: true })
      if (!video || !canvas || !context || video.readyState < 2 || !video.videoWidth) {
        timerRef.current = window.setTimeout(scan, 150)
        return
      }
      const width = video.videoWidth
      const height = video.videoHeight
      canvas.width = width
      canvas.height = height
      context.drawImage(video, 0, 0, width, height)
      const image = context.getImageData(0, 0, width, height)
      const found = jsQR(image.data, width, height, { inversionAttempts: "dontInvert" })
      if (found?.data) {
        stop()
        resultRef.current(found.data)
        return
      }
      timerRef.current = window.setTimeout(scan, 120)
    }

    void (async () => {
      setStarting(true)
      setError("")
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => undefined)
        }
        if (cancelled) return
        setStarting(false)
        scan()
      } catch {
        if (cancelled) return
        setStarting(false)
        setError(
          id
            ? "Kamera tidak bisa diakses. Izinkan akses kamera, atau input kode manual."
            : "Could not access the camera. Allow camera access, or enter the code manually."
        )
      }
    })()

    return () => {
      cancelled = true
      stop()
    }
  }, [open, id])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{id ? "Scan QR pesanan" : "Scan order QR"}</DialogTitle>
          <DialogDescription>
            {id
              ? "Arahkan kamera ke QR pesanan pelanggan."
              : "Point the camera at the customer order QR."}
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black">
          <video ref={videoRef} playsInline muted className="size-full object-cover" />
          {starting && (
            <div className="absolute inset-0 grid place-items-center">
              <Loader2 className="size-6 animate-spin text-white" />
            </div>
          )}
          <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-white/70" />
        </div>
        <canvas ref={canvasRef} className="hidden" />

        {error && <p className="text-xs text-destructive">{error}</p>}

        <Button variant="outline" onClick={() => onOpenChange(false)}>
          <X className="size-4" />
          {id ? "Tutup" : "Close"}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

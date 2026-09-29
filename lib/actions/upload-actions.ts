"use server"

/**
 * QuickStore — QR upload.
 *
 * Direct port of `POST /api/quickstore/upload`: a signed Cloudinary upload so
 * the API secret stays server-side. On top of the old behaviour the size and
 * type are now validated here as well — the request body reaches a Server
 * Action before any code of ours runs, so the check cannot be the only defence,
 * but it keeps a non-image or an oversized file from ever being forwarded to
 * Cloudinary (`next.config.mjs` caps the body at 3 MB for that reason).
 */
import { cloudinary } from "@/lib/cloudinary"
import { currentSession } from "./context"
import { fail, ok, type ActionResult } from "./result"

/** Same ceiling the upload widget advertises ("max 2 MB"). */
const MAX_UPLOAD_BYTES = 2_000_000

export async function uploadStoreQr(
  formData: FormData
): Promise<ActionResult<{ url: string; publicId: string }>> {
  const session = await currentSession()
  if (!session) return fail("Unauthorized", { status: 401 })

  const file = formData.get("file") as Blob | null
  if (!file || typeof file.arrayBuffer !== "function") {
    return fail("No file provided", { status: 400 })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return fail("Image must be 2 MB or smaller", { status: 400 })
  }
  if (file.type && !file.type.startsWith("image/")) {
    return fail("Only image files are allowed", { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const base64 = `data:${file.type};base64,${buffer.toString("base64")}`

  try {
    const result = await cloudinary.uploader.upload(base64, {
      folder: "crosscart/quickstore/qr",
      resource_type: "image",
      max_file_size: MAX_UPLOAD_BYTES,
    })

    return ok({ url: result.secure_url, publicId: result.public_id })
  } catch (error) {
    // console.error("[Cloudinary upload]", error)
    return fail("Upload failed", { status: 500 })
  }
}
/**
 * POST /api/quickstore/upload  — upload an image to Cloudinary
 * Returns { url, publicId } for storing in the DB.
 *
 * Uses a signed upload so the API secret stays server-side.
 */
import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"

import { authOptions } from "@/lib/auth"
import { cloudinary } from "@/lib/cloudinary"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as Blob | null
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const base64 = `data:${file.type};base64,${buffer.toString("base64")}`

  try {
    const result = await cloudinary.uploader.upload(base64, {
      folder: "crosscart/quickstore/qr",
      resource_type: "image",
      // Limit file size to 2 MB
      max_file_size: 2_000_000,
    })

    return NextResponse.json({
      url: result.secure_url,
      publicId: result.public_id,
    })
  } catch (error) {
    console.error("[Cloudinary upload]", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}

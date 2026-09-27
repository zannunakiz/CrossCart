/**
 * POST /api/pos/upload  — upload an image to Cloudinary for POS stores
 * Returns { url, publicId } for storing in the DB.
 *
 * Mirrors /api/quickstore/upload: a signed server-side upload, so the API
 * secret never reaches the browser and no unsigned upload preset is required.
 */
import { getServerSession } from "next-auth"
import { NextRequest, NextResponse } from "next/server"

import { authOptions } from "@/lib/auth"
import { cloudinary } from "@/lib/cloudinary"

export const runtime = "nodejs"

const MAX_FILE_SIZE = 2_000_000 // 2 MB

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
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 })
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Image must be 2 MB or smaller" }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const base64 = `data:${file.type};base64,${buffer.toString("base64")}`

  try {
    const result = await cloudinary.uploader.upload(base64, {
      folder: "crosscart/pos/store",
      resource_type: "image",
      max_file_size: MAX_FILE_SIZE,
    })

    return NextResponse.json({
      url: result.secure_url,
      publicId: result.public_id,
    })
  } catch (error) {
    console.error("[Pos Cloudinary upload]", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}

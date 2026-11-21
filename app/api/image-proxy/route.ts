import { NextRequest } from "next/server"
import { DEFAULT_BROWSER_UA, safePublicFetch } from "@/lib/server-fetch"
import { validatePublicUrl } from "@/lib/url-utils"

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/x-icon",
  "image/vnd.microsoft.icon",
])

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const CACHE_MAX_BYTES = 2 * 1024 * 1024 // 2 MB
const IMAGE_CACHE_TTL_MS = 15 * 60 * 1000
const IMAGE_CACHE_MAX = 40

const imageCache = new Map<
  string,
  { buffer: ArrayBuffer; contentType: string; expiresAt: number }
>()

function getCachedImage(key: string) {
  const entry = imageCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    imageCache.delete(key)
    return null
  }
  return entry
}

function setCachedImage(key: string, buffer: ArrayBuffer, contentType: string) {
  if (buffer.byteLength > CACHE_MAX_BYTES) return
  if (imageCache.size >= IMAGE_CACHE_MAX) {
    const oldestKey = imageCache.keys().next().value
    if (oldestKey !== undefined) imageCache.delete(oldestKey)
  }
  imageCache.set(key, {
    buffer,
    contentType,
    expiresAt: Date.now() + IMAGE_CACHE_TTL_MS,
  })
}

function sniffRasterContentType(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null

  // PNG: 89 50 4E 47
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png"
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg"
  }

  // GIF: 47 49 46 38
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif"
  }

  // WebP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp"
  }

  // ICO: 00 00 01 00
  if (
    bytes[0] === 0x00 &&
    bytes[1] === 0x00 &&
    bytes[2] === 0x01 &&
    bytes[3] === 0x00
  ) {
    return "image/x-icon"
  }

  return null
}

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("url")
  if (!target) {
    return Response.json({ error: "Missing url parameter." }, { status: 400 })
  }

  const check = validatePublicUrl(target)
  if (!check.ok) {
    return Response.json({ error: check.error }, { status: 400 })
  }

  const cacheKey = check.url.toString()
  const cached = getCachedImage(cacheKey)
  if (cached) {
    return new Response(cached.buffer.slice(0), {
      status: 200,
      headers: {
        "Content-Type": cached.contentType,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
      },
    })
  }

  try {
    const { response } = await safePublicFetch(cacheKey, {
      timeoutMs: 9000,
      headers: {
        "User-Agent": DEFAULT_BROWSER_UA,
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
      },
    })

    if (!response.ok) {
      return Response.json(
        { error: `Upstream returned status ${response.status}.` },
        { status: 502 }
      )
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0")
    if (contentLength > MAX_BYTES) {
      return Response.json(
        { error: "Image exceeds the 10 MB proxy limit." },
        { status: 413 }
      )
    }

    const arrayBuffer = await response.arrayBuffer()
    if (arrayBuffer.byteLength > MAX_BYTES) {
      return Response.json(
        { error: "Image exceeds the 10 MB proxy limit." },
        { status: 413 }
      )
    }

    const rawContentType = (response.headers.get("content-type") ?? "")
      .split(";")[0]!
      .trim()
      .toLowerCase()

    const finalContentType = ALLOWED_IMAGE_TYPES.has(rawContentType)
      ? rawContentType
      : sniffRasterContentType(new Uint8Array(arrayBuffer))

    if (!finalContentType) {
      return Response.json(
        { error: "Upstream response is not a supported raster image." },
        { status: 415 }
      )
    }

    setCachedImage(cacheKey, arrayBuffer, finalContentType)

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": finalContentType,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to proxy remote image."
    return Response.json({ error: message }, { status: 502 })
  }
}

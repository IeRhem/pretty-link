import { NextRequest } from "next/server"
import { safePublicFetch } from "@/lib/server-fetch"
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
      timeoutMs: 6500,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; PrettyLinkBot/1.0; +https://prettylink.app)",
        Accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
      },
    })

    if (!response.ok) {
      return Response.json(
        { error: `Upstream returned status ${response.status}.` },
        { status: 502 }
      )
    }

    const rawContentType = (response.headers.get("content-type") ?? "")
      .split(";")[0]!
      .trim()
      .toLowerCase()

    if (!ALLOWED_IMAGE_TYPES.has(rawContentType)) {
      return Response.json(
        { error: "Upstream response is not a supported raster image." },
        { status: 415 }
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

    setCachedImage(cacheKey, arrayBuffer, rawContentType)

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": rawContentType,
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

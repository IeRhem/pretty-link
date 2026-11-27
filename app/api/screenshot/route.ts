import { NextRequest } from "next/server"
import { safePublicFetch } from "@/lib/server-fetch"
import { validatePublicUrl } from "@/lib/url-utils"

const DESKTOP_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

const VALID_RASTER_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
])

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB
const CACHE_MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const SCREENSHOT_CACHE_TTL_MS = 15 * 60 * 1000
const SCREENSHOT_CACHE_MAX = 40
const MIN_SCREENSHOT_BYTES = 2500

type EffectiveScreenshotTheme = "light" | "dark" | "unthemed"

const screenshotCache = new Map<
  string,
  {
    buffer: ArrayBuffer
    contentType: string
    expiresAt: number
    effectiveTheme: EffectiveScreenshotTheme
  }
>()

function getCachedScreenshot(key: string) {
  const entry = screenshotCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    screenshotCache.delete(key)
    return null
  }
  return entry
}

function setCachedScreenshot(
  key: string,
  buffer: ArrayBuffer,
  contentType: string,
  effectiveTheme: EffectiveScreenshotTheme
) {
  if (buffer.byteLength > CACHE_MAX_BYTES) return
  if (screenshotCache.size >= SCREENSHOT_CACHE_MAX) {
    const oldestKey = screenshotCache.keys().next().value
    if (oldestKey !== undefined) screenshotCache.delete(oldestKey)
  }
  screenshotCache.set(key, {
    buffer,
    contentType,
    expiresAt: Date.now() + SCREENSHOT_CACHE_TTL_MS,
    effectiveTheme,
  })
}

async function tryFetchRasterImage(
  url: string,
  timeoutMs: number
): Promise<{
  buffer: ArrayBuffer
  contentType: string
  finalUrl: URL
} | null> {
  try {
    const { response, finalUrl } = await safePublicFetch(url, {
      timeoutMs,
      headers: {
        "User-Agent": DESKTOP_USER_AGENT,
        Accept: "image/webp,image/png,image/jpeg,image/*;q=0.8",
      },
    })
    if (!response.ok) return null

    const contentType = (response.headers.get("content-type") ?? "")
      .split(";")[0]!
      .trim()
      .toLowerCase()

    if (!VALID_RASTER_TYPES.has(contentType)) {
      return null
    }
    if (finalUrl.pathname.toLowerCase().endsWith("default.gif")) {
      return null
    }

    const buffer = await response.arrayBuffer()
    if (buffer.byteLength <= MIN_SCREENSHOT_BYTES || buffer.byteLength > MAX_BYTES) {
      return null
    }
    return { buffer, contentType, finalUrl }
  } catch {
    return null
  }
}

async function tryMicrolink(
  targetUrl: string,
  colorScheme: "light" | "dark",
  viewport: "desktop" | "mobile"
) {
  const vpParams =
    viewport === "mobile"
      ? "viewport.width=390&viewport.height=844&viewport.isMobile=true"
      : "viewport.width=1280&viewport.height=900"
  const endpoint = `https://api.microlink.io/?url=${encodeURIComponent(
    targetUrl
  )}&screenshot=true&meta=false&${vpParams}&colorScheme=${colorScheme}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": DESKTOP_USER_AGENT,
      },
    })
    if (!res.ok) return null

    const json = (await res.json()) as {
      status?: string
      data?: { screenshot?: { url?: string } }
    }
    const shotUrl = json.data?.screenshot?.url
    if (!shotUrl) return null

    const check = validatePublicUrl(shotUrl)
    if (!check.ok) return null

    return await tryFetchRasterImage(check.url.toString(), 8000)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function tryWordPressMshots(
  targetUrl: string,
  viewport: "desktop" | "mobile"
) {
  const dims = viewport === "mobile" ? "w=390&h=844" : "w=1280&h=960"
  const mshotsUrl = `https://s0.wp.com/mshots/v1/${encodeURIComponent(
    targetUrl
  )}?${dims}`

  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await tryFetchRasterImage(mshotsUrl, 8000)
    if (result) return result
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 1800))
    }
  }
  return null
}

async function tryThumIo(
  targetUrl: string,
  viewport: "desktop" | "mobile"
) {
  if (viewport === "mobile") {
    return null
  }
  const thumUrl = `https://image.thum.io/get/width/1280/crop/900/noanimate/${targetUrl}`
  return tryFetchRasterImage(thumUrl, 8000)
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url")
  const colorScheme =
    request.nextUrl.searchParams.get("theme") === "dark" ? "dark" : "light"
  const viewport =
    request.nextUrl.searchParams.get("viewport") === "mobile"
      ? "mobile"
      : "desktop"
  if (!rawUrl) {
    return Response.json({ error: "Missing url parameter." }, { status: 400 })
  }

  const check = validatePublicUrl(rawUrl)
  if (!check.ok) {
    return Response.json({ error: check.error }, { status: 400 })
  }

  const targetUrl = check.url.toString()
  const requestedCacheKey = `${targetUrl}|${colorScheme}|${viewport}`
  const unthemedCacheKey = `${targetUrl}|unthemed|${viewport}`
  const cached = getCachedScreenshot(requestedCacheKey)
  if (cached) {
    return new Response(cached.buffer.slice(0), {
      status: 200,
      headers: {
        "Content-Type": cached.contentType,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
        "X-Screenshot-Theme": cached.effectiveTheme,
      },
    })
  }

  const microlinkCapture = await tryMicrolink(targetUrl, colorScheme, viewport)
  if (!microlinkCapture) {
    const cachedUnthemed = getCachedScreenshot(unthemedCacheKey)
    if (cachedUnthemed) {
      return new Response(cachedUnthemed.buffer.slice(0), {
        status: 200,
        headers: {
          "Content-Type": cachedUnthemed.contentType,
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
          "X-Content-Type-Options": "nosniff",
          "X-Screenshot-Theme": cachedUnthemed.effectiveTheme,
        },
      })
    }
  }

  const fallbackCapture = microlinkCapture
    ? null
    : ((await tryWordPressMshots(targetUrl, viewport)) ??
      (await tryThumIo(targetUrl, viewport)))
  const captured = microlinkCapture ?? fallbackCapture

  if (!captured) {
    return Response.json(
      { error: "Could not capture website screenshot." },
      { status: 502 }
    )
  }

  const isThemedCapture = Boolean(microlinkCapture)
  const effectiveThemeHeader: EffectiveScreenshotTheme = isThemedCapture
    ? colorScheme
    : "unthemed"
  const storeCacheKey = isThemedCapture ? requestedCacheKey : unthemedCacheKey

  setCachedScreenshot(
    storeCacheKey,
    captured.buffer,
    captured.contentType,
    effectiveThemeHeader
  )

  return new Response(captured.buffer, {
    status: 200,
    headers: {
      "Content-Type": captured.contentType,
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
      "X-Screenshot-Theme": effectiveThemeHeader,
    },
  })
}

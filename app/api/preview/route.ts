import { NextRequest } from "next/server"
import { readHtmlHeadSnippet, safePublicFetch } from "@/lib/server-fetch"
import { detectSocialPlatform } from "@/lib/social-platforms"
import type { LinkMetadata } from "@/lib/studio-types"
import {
  formatDisplayUrl,
  toImageProxyUrl,
  validatePublicUrl,
} from "@/lib/url-utils"

const PREVIEW_CACHE_TTL_MS = 10 * 60 * 1000
const PREVIEW_CACHE_MAX = 100
const previewCache = new Map<string, { data: LinkMetadata; expiresAt: number }>()

function getCachedPreview(key: string): LinkMetadata | null {
  const entry = previewCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    previewCache.delete(key)
    return null
  }
  return entry.data
}

function setCachedPreview(key: string, data: LinkMetadata) {
  if (previewCache.size >= PREVIEW_CACHE_MAX) {
    const oldestKey = previewCache.keys().next().value
    if (oldestKey !== undefined) previewCache.delete(oldestKey)
  }
  previewCache.set(key, { data, expiresAt: Date.now() + PREVIEW_CACHE_TTL_MS })
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .trim()
}

function extractAttr(tag: string, attr: string): string | null {
  const re = new RegExp(
    `${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i"
  )
  const m = tag.match(re)
  return m ? decodeHtmlEntities(m[1] ?? m[2] ?? m[3] ?? "") : null
}

function parseHtmlMeta(html: string, baseUrl: URL) {
  let title = ""
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (titleMatch?.[1]) {
    title = decodeHtmlEntities(titleMatch[1].replace(/\s+/g, " "))
  }

  const metaTags = html.match(/<meta\s+[^>]*>/gi) ?? []
  const metaMap = new Map<string, string>()

  for (const tag of metaTags) {
    const key = (
      extractAttr(tag, "property") ??
      extractAttr(tag, "name") ??
      ""
    ).toLowerCase()
    const content = extractAttr(tag, "content")
    if (key && content && !metaMap.has(key)) {
      metaMap.set(key, content)
    }
  }

  let faviconUrl: string | null = null
  const linkTags = html.match(/<link\s+[^>]*>/gi) ?? []
  for (const tag of linkTags) {
    const rel = (extractAttr(tag, "rel") ?? "").toLowerCase()
    if (
      rel.includes("icon") ||
      rel.includes("apple-touch-icon") ||
      rel.includes("shortcut icon")
    ) {
      const href = extractAttr(tag, "href")
      if (href) {
        try {
          faviconUrl = new URL(href, baseUrl).toString()
          break
        } catch {
          // ignore malformed href
        }
      }
    }
  }

  if (!faviconUrl) {
    faviconUrl = `${baseUrl.origin}/favicon.ico`
  }

  const rawOgImage =
    metaMap.get("og:image") ??
    metaMap.get("og:image:secure_url") ??
    metaMap.get("twitter:image") ??
    metaMap.get("twitter:image:src") ??
    null

  let ogImageUrl: string | null = null
  if (rawOgImage) {
    try {
      ogImageUrl = new URL(rawOgImage, baseUrl).toString()
    } catch {
      ogImageUrl = null
    }
  }

  return {
    title:
      metaMap.get("og:title") ??
      metaMap.get("twitter:title") ??
      title,
    description:
      metaMap.get("og:description") ??
      metaMap.get("description") ??
      metaMap.get("twitter:description") ??
      "",
    siteName: metaMap.get("og:site_name") ?? baseUrl.hostname.replace(/^www\./, ""),
    themeColor: metaMap.get("theme-color") ?? null,
    ogImageUrl,
    faviconUrl,
  }
}

async function fetchGitHubEnrichment(url: URL) {
  const segments = url.pathname
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)

  if (segments.length === 0) return null

  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "PrettyLink/1.0",
  }

  try {
    if (segments.length === 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 2200)
      try {
        const res = await fetch(
          `https://api.github.com/users/${encodeURIComponent(segments[0]!)}`,
          { headers, signal: controller.signal }
        )
        if (!res.ok) return null
        const data = (await res.json()) as {
          name?: string
          login?: string
          bio?: string
          avatar_url?: string
          followers?: number
          public_repos?: number
        }
        return {
          title: data.name || data.login || segments[0]!,
          description: data.bio || "",
          avatarUrl: data.avatar_url || null,
          metrics:
            typeof data.followers === "number"
              ? `${data.followers.toLocaleString()} Followers · ${data.public_repos ?? 0} Repos`
              : null,
          ogImageUrl: null,
        }
      } finally {
        clearTimeout(timer)
      }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2200)
    try {
      const res = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(segments[0]!)}/${encodeURIComponent(segments[1]!)}`,
        { headers, signal: controller.signal }
      )
      if (!res.ok) return null
      const data = (await res.json()) as {
        full_name?: string
        name?: string
        description?: string
        stargazers_count?: number
        forks_count?: number
        owner?: { avatar_url?: string }
      }
      return {
        title: data.full_name || data.name || `${segments[0]}/${segments[1]}`,
        description: data.description || "",
        avatarUrl: data.owner?.avatar_url || null,
        metrics:
          typeof data.stargazers_count === "number"
            ? `${data.stargazers_count.toLocaleString()} Stars · ${(data.forks_count ?? 0).toLocaleString()} Forks`
            : null,
        ogImageUrl: `https://opengraph.githubassets.com/1/${segments[0]}/${segments[1]}`,
      }
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url")
  if (!rawUrl) {
    return Response.json({ error: "Missing url parameter." }, { status: 400 })
  }

  const check = validatePublicUrl(rawUrl)
  if (!check.ok) {
    return Response.json({ error: check.error }, { status: 400 })
  }

  const targetUrl = check.url
  const cacheKey = targetUrl.toString()
  const cacheEntryKey = `v2:${cacheKey}`
  const cached = getCachedPreview(cacheEntryKey)
  if (cached) {
    return Response.json(cached, {
      status: 200,
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    })
  }

  const detected = detectSocialPlatform(cacheKey)

  const htmlMetaPromise = (async () => {
    try {
      const { response, finalUrl } = await safePublicFetch(cacheKey, {
        timeoutMs: 2500,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; PrettyLinkBot/1.0; +https://prettylink.app)",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        },
      })
      if (!response.ok) return null
      const ct = (response.headers.get("content-type") ?? "").toLowerCase()
      if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
        return null
      }
      const headHtml = await readHtmlHeadSnippet(response, 49_152)
      return parseHtmlMeta(headHtml, finalUrl)
    } catch {
      return null
    }
  })()

  const githubPromise =
    detected.platform === "github"
      ? fetchGitHubEnrichment(targetUrl)
      : Promise.resolve(null)

  const [htmlMeta, ghMeta] = await Promise.all([
    htmlMetaPromise,
    githubPromise,
  ])

  const screenshotUrl = `/api/screenshot?url=${encodeURIComponent(cacheKey)}`

  const rawOgImage = ghMeta?.ogImageUrl || htmlMeta?.ogImageUrl || null
  const rawAvatar = ghMeta?.avatarUrl || htmlMeta?.ogImageUrl || null
  const rawFavicon = htmlMeta?.faviconUrl || `${targetUrl.origin}/favicon.ico`

  const metadata: LinkMetadata = {
    requestedUrl: rawUrl,
    normalizedUrl: cacheKey,
    displayUrl: formatDisplayUrl(cacheKey),
    domain: targetUrl.hostname.replace(/^www\./, ""),
    title:
      ghMeta?.title ||
      htmlMeta?.title ||
      detected.displayName,
    description:
      ghMeta?.description ||
      htmlMeta?.description ||
      `Explore ${formatDisplayUrl(cacheKey)} in a clean shareable frame.`,
    siteName: htmlMeta?.siteName || targetUrl.hostname.replace(/^www\./, ""),
    faviconUrl: toImageProxyUrl(rawFavicon),
    ogImageUrl: toImageProxyUrl(rawOgImage),
    screenshotUrl,
    avatarUrl: toImageProxyUrl(rawAvatar),
    themeColor: htmlMeta?.themeColor ?? null,
    detectedPlatform: detected.platform,
    handle: detected.handle,
    metrics: ghMeta?.metrics ?? null,
    fetchedAt: new Date().toISOString(),
  }

  setCachedPreview(cacheEntryKey, metadata)

  return Response.json(metadata, {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  })
}

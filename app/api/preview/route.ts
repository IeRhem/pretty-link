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

interface SocialEnrichment {
  title: string | null
  handle: string | null
  description: string | null
  avatarUrl: string | null
  coverUrl: string | null
  metrics: string | null
}

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

function formatCompactCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0"
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`
  }
  return String(Math.round(n))
}

function extractMetricsFromDescription(desc: string): string | null {
  if (!desc) return null
  const matches = Array.from(
    desc.matchAll(
      /(?<![\dA-Za-z])(?<!\d[.,])((?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)[KMB]?)\s+(Followers|Following|Posts|Subscribers|Videos|Shots|Likes)\b/gi
    )
  )
  if (matches.length === 0) return null
  return matches
    .slice(0, 3)
    .map((m) => `${m[1]} ${m[2]!.charAt(0).toUpperCase()}${m[2]!.slice(1).toLowerCase()}`)
    .join(" · ")
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

const RESERVED_X_PATHS = new Set([
  "home",
  "explore",
  "search",
  "notifications",
  "messages",
  "settings",
  "i",
])

async function fetchXEnrichment(url: URL): Promise<SocialEnrichment | null> {
  const segments = url.pathname
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
  const username = (segments[0] ?? "").replace(/^@/, "")
  if (!username || RESERVED_X_PATHS.has(username.toLowerCase())) {
    return null
  }

  try {
    const { response: res } = await safePublicFetch(
      `https://api.fxtwitter.com/${encodeURIComponent(username)}`,
      {
        timeoutMs: 8000,
        headers: {
          Accept: "application/json",
          "User-Agent": "PrettyLink/1.0",
        },
      }
    )
    if (res.ok) {
      const json = (await res.json()) as {
        user?: {
          name?: string
          screen_name?: string
          description?: string
          avatar_url?: string
          banner_url?: string
          followers?: number
          following?: number
          tweets?: number
        }
      }
      if (json.user) {
        const u = json.user
        const avatarUrl = u.avatar_url
          ? u.avatar_url.replace("_normal.", "_400x400.")
          : null
        const metrics =
          typeof u.followers === "number" || typeof u.tweets === "number"
            ? `${formatCompactCount(u.tweets ?? 0)} Posts · ${formatCompactCount(u.followers ?? 0)} Followers · ${formatCompactCount(u.following ?? 0)} Following`
            : null
        return {
          title: u.name || username,
          handle: `@${u.screen_name || username}`,
          description: u.description ?? "",
          avatarUrl,
          coverUrl: u.banner_url || null,
          metrics,
        }
      }
    }
  } catch {
    // Fall through to syndication widget fallback
  }

  try {
    const { response: res } = await safePublicFetch(
      `https://cdn.syndication.twimg.com/widgets/followbutton/info.json?screen_names=${encodeURIComponent(username)}`,
      {
        timeoutMs: 5000,
        headers: { Accept: "application/json", "User-Agent": "PrettyLink/1.0" },
      }
    )
    if (!res.ok) return null
    const arr = (await res.json()) as Array<{
      name?: string
      screen_name?: string
      followers_count?: number
    }>
    const entry = Array.isArray(arr) ? arr[0] : null
    if (!entry) return null
    return {
      title: entry.name || username,
      handle: `@${entry.screen_name || username}`,
      description: null,
      avatarUrl: null,
      coverUrl: null,
      metrics:
        typeof entry.followers_count === "number"
          ? `${formatCompactCount(entry.followers_count)} Followers`
          : null,
    }
  } catch {
    return null
  }
}

async function fetchBlueskyEnrichment(url: URL): Promise<SocialEnrichment | null> {
  const segments = url.pathname
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
  const rawActor = segments[0] === "profile" ? segments[1] : segments[0]
  const actor = (rawActor ?? "").replace(/^@/, "")
  if (!actor) return null

  try {
    const { response: res } = await safePublicFetch(
      `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`,
      {
        timeoutMs: 6000,
        headers: { Accept: "application/json", "User-Agent": "PrettyLink/1.0" },
      }
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      displayName?: string
      handle?: string
      description?: string
      avatar?: string
      banner?: string
      postsCount?: number
      followersCount?: number
      followsCount?: number
    }
    return {
      title: data.displayName || data.handle || actor,
      handle: `@${data.handle || actor}`,
      description: data.description ?? "",
      avatarUrl: data.avatar || null,
      coverUrl: data.banner || null,
      metrics: `${formatCompactCount(data.postsCount ?? 0)} Posts · ${formatCompactCount(data.followersCount ?? 0)} Followers · ${formatCompactCount(data.followsCount ?? 0)} Following`,
    }
  } catch {
    return null
  }
}

async function fetchGitHubEnrichment(url: URL): Promise<SocialEnrichment | null> {
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
      const { response: res } = await safePublicFetch(
        `https://api.github.com/users/${encodeURIComponent(segments[0]!)}`,
        { timeoutMs: 6000, headers }
      )
      if (!res.ok) return null
      const data = (await res.json()) as {
        name?: string
        login?: string
        bio?: string
        avatar_url?: string
        followers?: number
        following?: number
        public_repos?: number
      }
      return {
        title: data.name || data.login || segments[0]!,
        handle: `@${data.login || segments[0]!}`,
        description: data.bio ?? "",
        avatarUrl: data.avatar_url || null,
        coverUrl: null,
        metrics:
          typeof data.followers === "number"
            ? `${formatCompactCount(data.public_repos ?? 0)} Repos · ${formatCompactCount(data.followers)} Followers · ${formatCompactCount(data.following ?? 0)} Following`
            : null,
      }
    }

    const { response: res } = await safePublicFetch(
      `https://api.github.com/repos/${encodeURIComponent(segments[0]!)}/${encodeURIComponent(segments[1]!)}`,
      { timeoutMs: 6000, headers }
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      full_name?: string
      name?: string
      description?: string
      stargazers_count?: number
      forks_count?: number
      subscribers_count?: number
      watchers_count?: number
      owner?: { avatar_url?: string }
    }
    const watchers = data.subscribers_count ?? data.watchers_count ?? 0
    return {
      title: data.full_name || data.name || `${segments[0]}/${segments[1]}`,
      handle: `${segments[0]}/${segments[1]}`,
      description: data.description ?? "",
      avatarUrl: data.owner?.avatar_url || null,
      coverUrl: `https://opengraph.githubassets.com/1/${segments[0]}/${segments[1]}`,
      metrics:
        typeof data.stargazers_count === "number"
          ? `${formatCompactCount(data.stargazers_count)} Stars · ${formatCompactCount(data.forks_count ?? 0)} Forks · ${formatCompactCount(watchers)} Watchers`
          : null,
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
  const cacheEntryKey = `v6:${cacheKey}`
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
        timeoutMs: 6000,
        maxBytes: 49_152,
        stream: true,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; PrettyLinkBot/1.0; +https://prettylink.app)",
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        },
      })
      if (!response.ok) {
        await response.body?.cancel().catch(() => {})
        return null
      }
      const ct = (response.headers.get("content-type") ?? "").toLowerCase()
      if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
        await response.body?.cancel().catch(() => {})
        return null
      }
      const headHtml = await readHtmlHeadSnippet(response, 49_152)
      return parseHtmlMeta(headHtml, finalUrl)
    } catch {
      return null
    }
  })()

  const socialMetaPromise: Promise<SocialEnrichment | null> =
    detected.platform === "x"
      ? fetchXEnrichment(targetUrl)
      : detected.platform === "bluesky"
        ? fetchBlueskyEnrichment(targetUrl)
        : detected.platform === "github"
          ? fetchGitHubEnrichment(targetUrl)
          : Promise.resolve(null)

  const [htmlMeta, socialMeta] = await Promise.all([
    htmlMetaPromise,
    socialMetaPromise,
  ])

  const screenshotUrl = `/api/screenshot?url=${encodeURIComponent(cacheKey)}`

  const rawOgImage = htmlMeta?.ogImageUrl || null
  const rawAvatar =
    socialMeta?.avatarUrl ||
    (detected.platform !== "custom" ? htmlMeta?.ogImageUrl : null) ||
    null
  const rawCover = socialMeta?.coverUrl || null
  const rawFavicon = htmlMeta?.faviconUrl || `${targetUrl.origin}/favicon.ico`

  const description =
    socialMeta?.description !== null && socialMeta?.description !== undefined
      ? socialMeta.description
      : htmlMeta?.description ?? ""

  const metrics =
    socialMeta?.metrics ??
    extractMetricsFromDescription(htmlMeta?.description ?? "") ??
    null

  const metadata: LinkMetadata = {
    requestedUrl: rawUrl,
    normalizedUrl: cacheKey,
    displayUrl: formatDisplayUrl(cacheKey),
    domain: targetUrl.hostname.replace(/^www\./, ""),
    title:
      socialMeta?.title ||
      htmlMeta?.title ||
      detected.displayName,
    description,
    siteName: htmlMeta?.siteName || targetUrl.hostname.replace(/^www\./, ""),
    faviconUrl: toImageProxyUrl(rawFavicon),
    ogImageUrl: toImageProxyUrl(rawOgImage),
    screenshotUrl,
    avatarUrl: toImageProxyUrl(rawAvatar),
    coverUrl: toImageProxyUrl(rawCover),
    themeColor: htmlMeta?.themeColor ?? null,
    detectedPlatform: detected.platform,
    handle: socialMeta?.handle ?? detected.handle,
    metrics,
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

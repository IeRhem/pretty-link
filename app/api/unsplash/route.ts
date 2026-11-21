import { NextRequest } from "next/server"
import { CURATED_UNSPLASH_PHOTOS } from "@/lib/presets"
import type { UnsplashPhoto } from "@/lib/studio-types"
import { toImageProxyUrl } from "@/lib/url-utils"

function withProxyUrls(photos: UnsplashPhoto[]): UnsplashPhoto[] {
  return photos.map((photo) => ({
    ...photo,
    exportUrl: toImageProxyUrl(photo.fullUrl) ?? photo.fullUrl,
  }))
}

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase()
  const category = (request.nextUrl.searchParams.get("category") ?? "All").trim()

  const accessKey = process.env.UNSPLASH_ACCESS_KEY
  if (accessKey && q.length > 0) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)
      try {
        const res = await fetch(
          `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=18&orientation=squarish`,
          {
            signal: controller.signal,
            headers: { Authorization: `Client-ID ${accessKey}` },
          }
        )
        if (res.ok) {
          const json = (await res.json()) as {
            results?: Array<{
              id: string
              alt_description?: string | null
              color?: string | null
              urls?: { small?: string; regular?: string }
              user?: { name?: string; username?: string }
            }>
          }
          const mapped: UnsplashPhoto[] = (json.results ?? [])
            .filter((r) => r.urls?.small && r.urls?.regular)
            .map((r) => {
              const full = r.urls!.regular!
              return {
                id: r.id,
                category: "Abstract",
                alt: r.alt_description || "Unsplash background",
                photographer: r.user?.name || "Unsplash Creator",
                photographerHandle: `@${r.user?.username || "unsplash"}`,
                thumbUrl: r.urls!.small!,
                fullUrl: full,
                exportUrl: toImageProxyUrl(full) ?? full,
                accent: r.color || "#6366F1",
              }
            })
          if (mapped.length > 0) {
            return Response.json({ photos: mapped, source: "unsplash-api" })
          }
        }
      } finally {
        clearTimeout(timer)
      }
    } catch {
      // Fallback to curated catalog below
    }
  }

  const filtered = CURATED_UNSPLASH_PHOTOS.filter((photo) => {
    const categoryMatch =
      category === "All" || photo.category.toLowerCase() === category.toLowerCase()
    const queryMatch =
      !q ||
      photo.alt.toLowerCase().includes(q) ||
      photo.category.toLowerCase().includes(q) ||
      photo.photographer.toLowerCase().includes(q)
    return categoryMatch && queryMatch
  })

  return Response.json({
    photos: withProxyUrls(filtered),
    source: "curated",
  })
}

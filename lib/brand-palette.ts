import type { StudioState } from "@/lib/studio-types"
import { toImageProxyUrl } from "@/lib/url-utils"

export interface BrandPaletteResult {
  gradientFrom: string
  gradientVia: string
  gradientTo: string
  solidColor: string
  tabAccentColor: string
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => clampByte(v).toString(16).padStart(2, "0")
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

export function parseCssColorToRgb(
  raw: string | null | undefined
): [number, number, number] | null {
  if (!raw || typeof raw !== "string") return null
  const clean = raw.trim()
  const hexMatch = clean.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hexMatch?.[1]) {
    const h = hexMatch[1]
    if (h.length === 3) {
      return [
        parseInt(h[0]! + h[0]!, 16),
        parseInt(h[1]! + h[1]!, 16),
        parseInt(h[2]! + h[2]!, 16),
      ]
    }
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ]
  }
  const rgbMatch = clean.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i
  )
  if (rgbMatch) {
    return [
      clampByte(Number(rgbMatch[1])),
      clampByte(Number(rgbMatch[2])),
      clampByte(Number(rgbMatch[3])),
    ]
  }
  return null
}

function rgbToHsl(
  r: number,
  g: number,
  b: number
): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  let h = 0
  let s = 0

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0)
        break
      case gn:
        h = (bn - rn) / d + 2
        break
      default:
        h = (rn - gn) / d + 4
        break
    }
    h /= 6
  }

  return [h * 360, s, l]
}

function hslToRgb(
  hDeg: number,
  s: number,
  l: number
): [number, number, number] {
  const h = (((hDeg % 360) + 360) % 360) / 360
  const sc = Math.max(0, Math.min(1, s))
  const lc = Math.max(0, Math.min(1, l))
  if (sc === 0) {
    const v = clampByte(lc * 255)
    return [v, v, v]
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }
  const q = lc < 0.5 ? lc * (1 + sc) : lc + sc - lc * sc
  const p = 2 * lc - q
  return [
    clampByte(hue2rgb(p, q, h + 1 / 3) * 255),
    clampByte(hue2rgb(p, q, h) * 255),
    clampByte(hue2rgb(p, q, h - 1 / 3) * 255),
  ]
}

function colorDistance(
  a: [number, number, number],
  b: [number, number, number]
): number {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

/**
 * Pure brand palette builder from RGB pixel samples and/or a fallback themeColor string.
 */
export function buildBrandPaletteFromRgb(
  samples: Array<[number, number, number]>,
  fallbackThemeColor?: string | null
): BrandPaletteResult | null {
  const buckets = new Map<
    string,
    { count: number; rSum: number; gSum: number; bSum: number; score: number }
  >()

  for (const [r, g, b] of samples) {
    const [, s, l] = rgbToHsl(r, g, b)
    // Skip near-white or near-black background pixels
    if (l < 0.08 || l > 0.93) continue
    // Quantize into 24-step RGB buckets
    const qr = Math.round(r / 24) * 24
    const qg = Math.round(g / 24) * 24
    const qb = Math.round(b / 24) * 24
    const key = `${qr},${qg},${qb}`
    // Boost vibrant brand colors over muted grays
    const vibrancyWeight = 1 + s * 3.2 + (l >= 0.2 && l <= 0.78 ? 0.6 : 0)
    const entry = buckets.get(key)
    if (entry) {
      entry.count += 1
      entry.rSum += r
      entry.gSum += g
      entry.bSum += b
      entry.score += vibrancyWeight
    } else {
      buckets.set(key, {
        count: 1,
        rSum: r,
        gSum: g,
        bSum: b,
        score: vibrancyWeight,
      })
    }
  }

  const ranked = Array.from(buckets.values())
    .sort((a, b) => b.score - a.score)
    .map(
      (b): [number, number, number] => [
        clampByte(b.rSum / b.count),
        clampByte(b.gSum / b.count),
        clampByte(b.bSum / b.count),
      ]
    )

  const themeRgb = parseCssColorToRgb(fallbackThemeColor)
  const primaryRgb = ranked[0] ?? themeRgb
  if (!primaryRgb) return null

  const [h1, s1, l1] = rgbToHsl(primaryRgb[0], primaryRgb[1], primaryRgb[2])
  // Ensure primary brand color has rich studio presence
  const tunedPrimary = hslToRgb(
    h1,
    Math.max(s1, 0.42),
    Math.max(0.28, Math.min(0.62, l1))
  )

  // Look for a distinct secondary brand stop from the image samples
  const secondaryCandidate = ranked.find(
    (c) => colorDistance(c, primaryRgb) >= 68
  )

  let tunedSecondary: [number, number, number]
  let tunedVia: [number, number, number]

  if (secondaryCandidate) {
    const [h2, s2, l2] = rgbToHsl(
      secondaryCandidate[0],
      secondaryCandidate[1],
      secondaryCandidate[2]
    )
    tunedSecondary = hslToRgb(
      h2,
      Math.max(s2, 0.38),
      Math.max(0.22, Math.min(0.58, l2))
    )
    tunedVia = [
      clampByte((tunedPrimary[0] + tunedSecondary[0]) / 2),
      clampByte((tunedPrimary[1] + tunedSecondary[1]) / 2),
      clampByte((tunedPrimary[2] + tunedSecondary[2]) / 2),
    ]
  } else {
    // Analogous studio gradient derived from primary brand hue
    tunedVia = hslToRgb(
      h1 + 18,
      Math.max(0.48, Math.min(0.88, s1 + 0.1)),
      Math.max(0.24, Math.min(0.54, l1 - 0.04))
    )
    tunedSecondary = hslToRgb(
      h1 + 38,
      Math.max(0.52, Math.min(0.92, s1 + 0.14)),
      Math.max(0.18, Math.min(0.46, l1 - 0.12))
    )
  }

  const fromHex = rgbToHex(tunedPrimary[0], tunedPrimary[1], tunedPrimary[2])
  const viaHex = rgbToHex(tunedVia[0], tunedVia[1], tunedVia[2])
  const toHex = rgbToHex(
    tunedSecondary[0],
    tunedSecondary[1],
    tunedSecondary[2]
  )

  return {
    gradientFrom: fromHex,
    gradientVia: viaHex,
    gradientTo: toHex,
    solidColor: fromHex,
    tabAccentColor: fromHex,
  }
}

function sampleImageRgbPixels(
  src: string,
  timeoutMs = 3500
): Promise<Array<[number, number, number]> | null> {
  if (typeof document === "undefined") return Promise.resolve(null)
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.referrerPolicy = "no-referrer"
    const timer = setTimeout(() => resolve(null), timeoutMs)

    img.onload = () => {
      clearTimeout(timer)
      try {
        const size = 36
        const canvas = document.createElement("canvas")
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          resolve(null)
          return
        }
        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)
        const samples: Array<[number, number, number]> = []
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3]!
          if (a < 110) continue
          samples.push([data[i]!, data[i + 1]!, data[i + 2]!])
        }
        resolve(samples.length > 0 ? samples : null)
      } catch {
        resolve(null)
      }
    }

    img.onerror = () => {
      clearTimeout(timer)
      resolve(null)
    }

    img.src = src
  })
}

export async function extractBrandPaletteFromState(
  state: StudioState
): Promise<BrandPaletteResult | null> {
  const rawCandidates =
    state.mode === "social"
      ? [
          state.socialAvatarUrl,
          state.metadata?.avatarUrl,
          state.customFaviconUrl,
          state.metadata?.faviconUrl,
          state.socialCoverUrl,
          state.metadata?.coverUrl,
        ]
      : [
          state.customFaviconUrl,
          state.metadata?.faviconUrl,
          state.customScreenshotUrl,
          state.metadata?.ogImageUrl,
          state.metadata?.screenshotUrl,
        ]

  const candidates = rawCandidates
    .map((url) => {
      if (!url) return null
      if (url.startsWith("data:") || url.startsWith("/api/image-proxy?")) {
        return url
      }
      return toImageProxyUrl(url) ?? url
    })
    .filter((v): v is string => Boolean(v))

  for (const candidate of candidates) {
    const samples = await sampleImageRgbPixels(candidate)
    if (samples && samples.length > 0) {
      const palette = buildBrandPaletteFromRgb(
        samples,
        state.metadata?.themeColor
      )
      if (palette) return palette
    }
  }

  return buildBrandPaletteFromRgb([], state.metadata?.themeColor)
}

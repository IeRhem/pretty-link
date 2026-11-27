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
  const rgbOnlyMatch = clean.match(
    /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i
  )
  const rgbaMatch = clean.match(
    /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(?:0?\.\d+|1(?:\.0+)?|0|\d{1,3}(?:\.\d+)?%)\s*\)$/i
  )
  const rgbMatch = rgbOnlyMatch ?? rgbaMatch
  if (rgbMatch) {
    const r = Number(rgbMatch[1])
    const g = Number(rgbMatch[2])
    const b = Number(rgbMatch[3])
    if (r <= 255 && g <= 255 && b <= 255) {
      return [r, g, b]
    }
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
 * Extracts the website's dominant chromatic hue and generates a subdued, dim
 * complementary backdrop so the website mockup stands out as the visual hero.
 */
export function buildBrandPaletteFromRgb(
  samples: Array<[number, number, number]>,
  fallbackThemeColor?: string | null
): BrandPaletteResult | null {
  const chromaticBuckets = new Map<
    string,
    { count: number; rSum: number; gSum: number; bSum: number; score: number }
  >()
  const neutralBuckets = new Map<
    string,
    { count: number; rSum: number; gSum: number; bSum: number; score: number }
  >()

  for (const [r, g, b] of samples) {
    const [, s, l] = rgbToHsl(r, g, b)
    // Skip extreme near-black or near-white background pixels
    if (l < 0.06 || l > 0.94) continue

    const qr = Math.round(r / 24) * 24
    const qg = Math.round(g / 24) * 24
    const qb = Math.round(b / 24) * 24
    const key = `${qr},${qg},${qb}`

    // Separate truly chromatic pixels from low-saturation grays so gray background
    // noise is never mistaken for a chromatic hue
    if (s >= 0.14 && l >= 0.1 && l <= 0.88) {
      const midLightBonus = 1 - Math.abs(l - 0.5) * 0.9
      const weight = (0.5 + s * s * 4.5) * Math.max(0.35, midLightBonus)
      const entry = chromaticBuckets.get(key)
      if (entry) {
        entry.count += 1
        entry.rSum += r
        entry.gSum += g
        entry.bSum += b
        entry.score += weight
      } else {
        chromaticBuckets.set(key, {
          count: 1,
          rSum: r,
          gSum: g,
          bSum: b,
          score: weight,
        })
      }
    } else {
      const entry = neutralBuckets.get(key)
      if (entry) {
        entry.count += 1
        entry.rSum += r
        entry.gSum += g
        entry.bSum += b
        entry.score += 1
      } else {
        neutralBuckets.set(key, {
          count: 1,
          rSum: r,
          gSum: g,
          bSum: b,
          score: 1,
        })
      }
    }
  }

  const rankedChromatic = Array.from(chromaticBuckets.values())
    .sort((a, b) => b.score - a.score)
    .map(
      (b): [number, number, number] => [
        clampByte(b.rSum / b.count),
        clampByte(b.gSum / b.count),
        clampByte(b.bSum / b.count),
      ]
    )

  const rankedNeutral = Array.from(neutralBuckets.values())
    .sort((a, b) => b.score - a.score)
    .map(
      (b): [number, number, number] => [
        clampByte(b.rSum / b.count),
        clampByte(b.gSum / b.count),
        clampByte(b.bSum / b.count),
      ]
    )

  const themeRgb = parseCssColorToRgb(fallbackThemeColor)
  const themeHsl = themeRgb
    ? rgbToHsl(themeRgb[0], themeRgb[1], themeRgb[2])
    : null
  const chromaticThemeRgb =
    themeRgb && themeHsl && themeHsl[1] >= 0.14 ? themeRgb : null

  const primaryRgb =
    rankedChromatic[0] ??
    chromaticThemeRgb ??
    themeRgb ??
    rankedNeutral[0] ??
    null
  if (!primaryRgb) return null

  const [h1, s1, l1] = rgbToHsl(primaryRgb[0], primaryRgb[1], primaryRgb[2])
  const isMonochromeSite = s1 < 0.14

  if (isMonochromeSite) {
    // Monochrome / neutral site: produce a dim, understated slate-charcoal complementary backdrop
    const baseHue = 222
    const fromRgb = hslToRgb(baseHue, 0.16, 0.24)
    const viaRgb = hslToRgb(baseHue + 12, 0.18, 0.2)
    const toRgb = hslToRgb(baseHue + 24, 0.2, 0.16)
    const accentRgb = hslToRgb(baseHue, 0.28, 0.42)
    return {
      gradientFrom: rgbToHex(fromRgb[0], fromRgb[1], fromRgb[2]),
      gradientVia: rgbToHex(viaRgb[0], viaRgb[1], viaRgb[2]),
      gradientTo: rgbToHex(toRgb[0], toRgb[1], toRgb[2]),
      solidColor: rgbToHex(viaRgb[0], viaRgb[1], viaRgb[2]),
      tabAccentColor: rgbToHex(accentRgb[0], accentRgb[1], accentRgb[2]),
    }
  }

  // Secondary chromatic stop from the site (if present and distinct)
  const secondaryCandidate = rankedChromatic.find(
    (c) => colorDistance(c, primaryRgb) >= 64
  )

  // Compute a complementary / split-complementary hue so the background complements
  // the website rather than matching/competing with it
  const compHueCenter = (h1 + 180) % 360
  const compHueStart = (h1 + 152) % 360
  let compHueEnd = (h1 + 208) % 360

  if (secondaryCandidate) {
    const [h2] = rgbToHsl(
      secondaryCandidate[0],
      secondaryCandidate[1],
      secondaryCandidate[2]
    )
    compHueEnd = (h2 + 180) % 360
  }

  // Keep saturation balanced (0.28 - 0.42) and mid-tone lightness (0.26 - 0.34)
  // so the user can adjust the Dim slider up or down to make it brighter or darker
  const mutedSat = Math.max(0.28, Math.min(0.42, s1 * 0.56))
  const lightStart = Math.max(0.3, Math.min(0.36, 0.32 + (l1 - 0.5) * 0.04))
  const lightMid = Math.max(0.26, lightStart - 0.04)
  const lightEnd = Math.max(0.22, lightStart - 0.08)

  const compStartRgb = hslToRgb(compHueStart, mutedSat, lightStart)
  const compMidRgb = hslToRgb(compHueCenter, mutedSat * 0.95, lightMid)
  const compEndRgb = hslToRgb(compHueEnd, mutedSat * 1.05, lightEnd)

  // Subtle, readable brand-derived accent for the browser URL pill
  const tabAccentRgb = hslToRgb(
    h1,
    Math.max(0.32, Math.min(0.55, s1 * 0.7)),
    0.36
  )

  const fromHex = rgbToHex(compStartRgb[0], compStartRgb[1], compStartRgb[2])
  const viaHex = rgbToHex(compMidRgb[0], compMidRgb[1], compMidRgb[2])
  const toHex = rgbToHex(compEndRgb[0], compEndRgb[1], compEndRgb[2])
  const accentHex = rgbToHex(tabAccentRgb[0], tabAccentRgb[1], tabAccentRgb[2])

  return {
    gradientFrom: fromHex,
    gradientVia: viaHex,
    gradientTo: toHex,
    solidColor: viaHex,
    tabAccentColor: accentHex,
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
    let settled = false

    const cleanupAndResolve = (
      result: Array<[number, number, number]> | null,
      timedOut = false
    ) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      img.onload = null
      img.onerror = null
      if (timedOut) {
        img.src = ""
      }
      resolve(result)
    }

    const timer = setTimeout(() => cleanupAndResolve(null, true), timeoutMs)

    img.onload = () => {
      try {
        const size = 36
        const canvas = document.createElement("canvas")
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          cleanupAndResolve(null)
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
        cleanupAndResolve(samples.length > 0 ? samples : null)
      } catch {
        cleanupAndResolve(null)
      }
    }

    img.onerror = () => {
      cleanupAndResolve(null)
    }

    img.src = src
  })
}

export function getModeBrandImageCandidates(
  state: StudioState
): Array<string | null | undefined> {
  if (state.mode === "social") {
    return [
      state.socialCoverUrl,
      state.metadata?.coverUrl,
      state.socialAvatarUrl,
      state.metadata?.avatarUrl,
      state.customFaviconUrl,
      state.metadata?.faviconUrl,
    ]
  }
  if (state.webLayout === "tab") {
    return [
      state.customFaviconUrl,
      state.metadata?.faviconUrl,
      state.metadata?.ogImageUrl,
      state.metadata?.screenshotUrl,
      state.customScreenshotUrl,
    ]
  }
  return [
    state.customScreenshotUrl,
    state.metadata?.screenshotUrl,
    state.metadata?.ogImageUrl,
    state.customFaviconUrl,
    state.metadata?.faviconUrl,
  ]
}

export function hasEligibleBrandSource(state: StudioState): boolean {
  if (parseCssColorToRgb(state.metadata?.themeColor)) {
    return true
  }
  return getModeBrandImageCandidates(state).some((url) => Boolean(url?.trim()))
}

function hasChromaticPixels(
  samples: ReadonlyArray< readonly [number, number, number]>
): boolean {
  for (const [r, g, b] of samples) {
    const [, s, l] = rgbToHsl(r, g, b)
    if (l < 0.07 || l > 0.94) continue
    if (s >= 0.14) return true
  }
  return false
}

export async function extractBrandPaletteFromState(
  state: StudioState
): Promise<BrandPaletteResult | null> {
  const rawCandidates = getModeBrandImageCandidates(state)

  const candidates = rawCandidates
    .map((url) => {
      if (!url) return null
      if (url.startsWith("data:") || url.startsWith("/api/")) {
        return url
      }
      return toImageProxyUrl(url) ?? url
    })
    .filter((v): v is string => Boolean(v))

  let fallbackNeutralSamples: Array<[number, number, number]> | null = null

  for (const candidate of candidates) {
    const samples = await sampleImageRgbPixels(candidate)
    if (samples && samples.length > 0) {
      if (hasChromaticPixels(samples)) {
        const palette = buildBrandPaletteFromRgb(
          samples,
          state.metadata?.themeColor
        )
        if (palette) return palette
      } else if (!fallbackNeutralSamples) {
        fallbackNeutralSamples = samples
      }
    }
  }

  return buildBrandPaletteFromRgb(
    fallbackNeutralSamples ?? [],
    state.metadata?.themeColor
  )
}

import type { StudioState } from "@/lib/studio-types"

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ""
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function formatDisplayUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return "www.lerhem.space"
  return trimmed.replace(/^https?:\/\//i, "").replace(/\/+$/, "")
}

function isPrivateOrBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (!host) return true

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".arpa")
  ) {
    return true
  }

  // IPv6 checks
  if (host.includes(":")) {
    if (host === "::" || host === "::1") return true
    const lower = host.toLowerCase()
    if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) {
      return true
    }
    // IPv4-mapped IPv6 e.g. ::ffff:127.0.0.1
    const v4Match = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (v4Match?.[1]) {
      return isBlockedIpv4(v4Match[1])
    }
    return false
  }

  // Numeric IPv4 check
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return isBlockedIpv4(host)
  }

  // Reject bare integer / hex IPs without dots
  if (/^(0x[0-9a-f]+|\d+)$/i.test(host)) {
    return true
  }

  if (!host.includes(".")) {
    return true
  }

  return false
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((n) => Number(n))
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true
  }
  const [a, b] = parts
  if (a === 0) return true
  if (a === 10) return true
  if (a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a >= 224) return true
  return false
}

export function validatePublicUrl(
  raw: string
): { ok: true; url: URL } | { ok: false; error: string } {
  const normalized = normalizeUrl(raw)
  if (!normalized || normalized.length > 2048) {
    return { ok: false, error: "Please enter a valid web or social URL." }
  }

  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    return { ok: false, error: "URL format is invalid." }
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only HTTP and HTTPS URLs are supported." }
  }

  if (parsed.username || parsed.password) {
    return { ok: false, error: "URLs with embedded credentials are not allowed." }
  }

  if (isPrivateOrBlockedHostname(parsed.hostname)) {
    return { ok: false, error: "Private, loopback, or local addresses cannot be fetched." }
  }

  return { ok: true, url: parsed }
}

export function toImageProxyUrl(remoteUrl: string | null | undefined): string | null {
  if (!remoteUrl) return null
  if (remoteUrl.startsWith("/api/image-proxy?") || remoteUrl.startsWith("data:")) {
    return remoteUrl
  }
  const check = validatePublicUrl(remoteUrl)
  if (!check.ok) return null
  return `/api/image-proxy?url=${encodeURIComponent(check.url.toString())}`
}

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ""
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(encoded: string): string {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((encoded.length + 3) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}

export function encodeShareState(state: StudioState): string {
  const compact: Record<string, unknown> = {
    mode: state.mode,
    url: state.url,
    aspectRatioId: state.aspectRatioId,
    customWidth: state.customWidth,
    customHeight: state.customHeight,
    backgroundType: state.backgroundType,
    colorFillMode: state.colorFillMode,
    gradientId: state.gradientId,
    gradientFrom: state.gradientFrom,
    gradientVia: state.gradientVia,
    gradientTo: state.gradientTo,
    gradientAngle: state.gradientAngle,
    solidColor: state.solidColor,
    noiseOverlay: state.noiseOverlay,
    backgroundImageUrl: state.backgroundImageUrl.startsWith("data:")
      ? ""
      : state.backgroundImageUrl,
    unsplashPhotoId: state.unsplashPhotoId,
    unsplashPhotographer: state.unsplashPhotographer,
    bgBlur: state.bgBlur,
    bgDim: state.bgDim,
    borderStyle: state.borderStyle,
    webLayout: state.webLayout,
    browserChrome: state.browserChrome,
    chromeTheme: state.chromeTheme,
    frameScale: state.frameScale,
    frameShadow: state.frameShadow,
    customScreenshotUrl: state.customScreenshotUrl.startsWith("data:")
      ? ""
      : state.customScreenshotUrl,
    socialPlatform: state.socialPlatform,
    socialCardStyle: state.socialCardStyle,
    socialCardTheme: state.socialCardTheme,
    socialDisplayName: state.socialDisplayName,
    socialHandle: state.socialHandle,
    socialBio: state.socialBio,
    socialMetrics: state.socialMetrics,
    socialCtaLabel: state.socialCtaLabel,
    socialAvatarUrl: state.socialAvatarUrl.startsWith("data:")
      ? ""
      : state.socialAvatarUrl,
    socialCoverUrl: state.socialCoverUrl.startsWith("data:")
      ? ""
      : state.socialCoverUrl,
    socialVerified: state.socialVerified,
    socialShowQr: state.socialShowQr,
  }
  return toBase64Url(JSON.stringify(compact))
}

export function decodeShareState(encoded: string): Partial<StudioState> | null {
  if (!encoded || encoded.length > 8192) return null
  try {
    const parsed = JSON.parse(fromBase64Url(encoded))
    if (!parsed || typeof parsed !== "object") return null
    return parsed as Partial<StudioState>
  } catch {
    return null
  }
}

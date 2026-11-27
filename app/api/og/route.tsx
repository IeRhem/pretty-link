import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"
import { NextRequest } from "next/server"
import { parseSocialStats, resolveTabAccentColor } from "@/lib/presets"
import { SOCIAL_PLATFORMS } from "@/lib/social-platforms"
import {
  DEFAULT_STUDIO_STATE,
  type FontStyleId,
  type StudioState,
} from "@/lib/studio-types"
import { decodeShareState, formatDisplayUrl } from "@/lib/url-utils"

interface OgFontDescriptor {
  name: string
  data: ArrayBuffer
  weight: 400 | 600 | 700
  style: "normal"
}

const fontBufferCache = new Map<string, Promise<ArrayBuffer | null>>()

function readFirstAvailableFont(paths: string[]): Promise<ArrayBuffer | null> {
  const cacheKey = paths.join("|")
  const existing = fontBufferCache.get(cacheKey)
  if (existing) return existing

  const promise = (async () => {
    for (const filePath of paths) {
      try {
        const buf = await readFile(filePath)
        return buf.buffer.slice(
          buf.byteOffset,
          buf.byteOffset + buf.byteLength
        ) as ArrayBuffer
      } catch {
        // Try next candidate path
      }
    }
    return null
  })()

  fontBufferCache.set(cacheKey, promise)
  return promise
}

async function resolveOgFontConfig(fontStyle: FontStyleId): Promise<{
  fontFamily: string
  fonts: OgFontDescriptor[]
}> {
  const bundledGeistPath = join(
    process.cwd(),
    "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf"
  )

  if (fontStyle === "mono") {
    const [regularData, boldData] = await Promise.all([
      readFirstAvailableFont([
        "/usr/share/fonts/liberation-mono-fonts/LiberationMono-Regular.ttf",
        "/usr/share/fonts/google-noto/NotoSansMono-Regular.ttf",
        bundledGeistPath,
      ]),
      readFirstAvailableFont([
        "/usr/share/fonts/liberation-mono-fonts/LiberationMono-Bold.ttf",
        "/usr/share/fonts/google-noto/NotoSansMono-Bold.ttf",
        bundledGeistPath,
      ]),
    ])
    const fallbackData = regularData ?? boldData
    if (fallbackData) {
      return {
        fontFamily: "PrettyLinkMono",
        fonts: [
          {
            name: "PrettyLinkMono",
            data: regularData ?? fallbackData,
            weight: 400,
            style: "normal",
          },
          {
            name: "PrettyLinkMono",
            data: boldData ?? fallbackData,
            weight: 600,
            style: "normal",
          },
          {
            name: "PrettyLinkMono",
            data: boldData ?? fallbackData,
            weight: 700,
            style: "normal",
          },
        ],
      }
    }
  }

  if (fontStyle === "editorial") {
    const [regularData, boldData] = await Promise.all([
      readFirstAvailableFont([
        "/usr/share/fonts/google-crosextra-caladea-fonts/Caladea-Regular.ttf",
        bundledGeistPath,
      ]),
      readFirstAvailableFont([
        "/usr/share/fonts/google-crosextra-caladea-fonts/Caladea-Bold.ttf",
        bundledGeistPath,
      ]),
    ])
    const fallbackData = regularData ?? boldData
    if (fallbackData) {
      return {
        fontFamily: "PrettyLinkEditorial",
        fonts: [
          {
            name: "PrettyLinkEditorial",
            data: regularData ?? fallbackData,
            weight: 400,
            style: "normal",
          },
          {
            name: "PrettyLinkEditorial",
            data: boldData ?? fallbackData,
            weight: 600,
            style: "normal",
          },
          {
            name: "PrettyLinkEditorial",
            data: boldData ?? fallbackData,
            weight: 700,
            style: "normal",
          },
        ],
      }
    }
  }

  return {
    fontFamily: "sans-serif",
    fonts: [],
  }
}

export async function GET(req: NextRequest) {
  const rawD = req.nextUrl.searchParams.get("d") ?? ""
  const decoded = rawD ? decodeShareState(rawD) : null
  const state: StudioState = decoded
    ? { ...DEFAULT_STUDIO_STATE, ...decoded, metadata: null }
    : DEFAULT_STUDIO_STATE

  const displayUrl = formatDisplayUrl(state.url)
  const accentColor = resolveTabAccentColor(state)
  const isDarkChrome = state.chromeTheme === "dark"

  const SAFE_OG_HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
  const sanitizeOgHex = (val: string | undefined, fallback: string): string => {
    const trimmed = typeof val === "string" ? val.trim() : ""
    return SAFE_OG_HEX_RE.test(trimmed) ? trimmed : fallback
  }

  const safeSolid = sanitizeOgHex(state.solidColor, "#4F46E5")
  const safeFrom = sanitizeOgHex(state.gradientFrom, "#7C3AED")
  const safeTo = sanitizeOgHex(state.gradientTo, "#3B82F6")
  const trimmedVia =
    typeof state.gradientVia === "string" ? state.gradientVia.trim() : ""
  const safeVia = SAFE_OG_HEX_RE.test(trimmedVia) ? trimmedVia : ""
  const safeAngle = Number.isFinite(state.gradientAngle)
    ? Math.max(0, Math.min(360, Math.round(state.gradientAngle)))
    : 135

  const bgStyle =
    state.backgroundType === "none"
      ? "linear-gradient(135deg, #18181B 0%, #27272A 100%)"
      : state.backgroundType === "color" && state.colorFillMode === "solid"
        ? safeSolid
        : safeVia
          ? `linear-gradient(${safeAngle}deg, ${safeFrom} 0%, ${safeVia} 50%, ${safeTo} 100%)`
          : `linear-gradient(${safeAngle}deg, ${safeFrom} 0%, ${safeTo} 100%)`

  const { fontFamily, fonts } = await resolveOgFontConfig(
    state.fontStyle ?? "instrument"
  )

  const hasCallout =
    Boolean(state.showCalloutBadge) && Boolean(state.calloutText?.trim())
  const headlineText = state.showPosterHeader
    ? state.posterHeadline.replace(/\n+/g, " ").trim()
    : ""
  const accentText = state.showPosterHeader
    ? state.posterAccentText.trim()
    : ""
  const platform =
    SOCIAL_PLATFORMS[state.socialPlatform] ?? SOCIAL_PLATFORMS.custom
  const stats = parseSocialStats(state.socialMetrics)
  const socialHandleRowText = `${state.socialHandle || "@Oliviar_"} · ${platform.shortLabel}`
  const addressUrlText = `https://${displayUrl}`
  const webSublineText = `Interactive link showcase · ${displayUrl}`

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          background: bgStyle,
          padding: "44px 64px",
          fontFamily,
          color: "#FFFFFF",
          position: "relative",
        }}
      >
        {state.backgroundType !== "none" && state.bgDim > 0 ? (
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: `rgba(0, 0, 0, ${Math.min(0.85, state.bgDim / 100)})`,
            }}
          />
        ) : null}
        {/* Top Row: PrettyLink Badge + Optional Callout Pill */}
        <div
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative",
          }}
        >
          {hasCallout && state.calloutPosition === "top-left" ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  background: "rgba(9, 9, 11, 0.85)",
                  border: "1px solid rgba(255, 255, 255, 0.22)",
                  borderRadius: "999px",
                  padding: "8px 18px",
                  fontSize: "18px",
                  fontWeight: 600,
                }}
              >
                <div
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "999px",
                    background: accentColor,
                  }}
                />
                <span>{state.calloutText.trim()}</span>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  background: "rgba(9, 9, 11, 0.55)",
                  border: "1px solid rgba(255, 255, 255, 0.18)",
                  borderRadius: "999px",
                  padding: "8px 16px",
                  fontSize: "18px",
                  fontWeight: 700,
                }}
              >
                <div
                  style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "999px",
                    background: accentColor,
                  }}
                />
                <span>PrettyLink</span>
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  background: "rgba(9, 9, 11, 0.55)",
                  border: "1px solid rgba(255, 255, 255, 0.18)",
                  borderRadius: "999px",
                  padding: "8px 16px",
                  fontSize: "18px",
                  fontWeight: 700,
                }}
              >
                <div
                  style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "999px",
                    background: accentColor,
                  }}
                />
                <span>PrettyLink</span>
              </div>

              {hasCallout && state.calloutPosition === "top-center" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    background: "rgba(9, 9, 11, 0.85)",
                    border: "1px solid rgba(255, 255, 255, 0.22)",
                    borderRadius: "999px",
                    padding: "8px 18px",
                    fontSize: "18px",
                    fontWeight: 600,
                  }}
                >
                  <div
                    style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "999px",
                      background: accentColor,
                    }}
                  />
                  <span>{state.calloutText.trim()}</span>
                </div>
              )}

              {hasCallout && state.calloutPosition === "top-center" ? (
                <div style={{ width: "130px", display: "flex" }} />
              ) : hasCallout ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    background: "rgba(9, 9, 11, 0.85)",
                    border: "1px solid rgba(255, 255, 255, 0.22)",
                    borderRadius: "999px",
                    padding: "8px 18px",
                    fontSize: "18px",
                    fontWeight: 600,
                  }}
                >
                  <div
                    style={{
                      width: "10px",
                      height: "10px",
                      borderRadius: "999px",
                      background: accentColor,
                    }}
                  />
                  <span>{state.calloutText.trim()}</span>
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Optional Headline Overlay */}
        {headlineText ? (
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "center",
              gap: "12px",
              fontSize: "44px",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              textAlign: "center",
              maxWidth: "980px",
            }}
          >
            <span>{headlineText}</span>
            {accentText ? (
              <span style={{ color: "rgba(255, 255, 255, 0.55)" }}>
                {accentText}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Center Mockup Card */}
        {state.mode === "code" ? (
          <div
            style={{
              width: "820px",
              display: "flex",
              flexDirection: "column",
              background:
                state.codeTheme === "light" ? "#FFFFFF" : "#0D0D11",
              color: state.codeTheme === "light" ? "#09090B" : "#FAFAFA",
              borderRadius: "28px",
              padding: "32px 36px",
              boxShadow: "0 28px 64px rgba(0, 0, 0, 0.38)",
              border: "1px solid rgba(255, 255, 255, 0.16)",
              gap: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <span
                  style={{
                    background: accentColor,
                    color: "#FFFFFF",
                    borderRadius: "999px",
                    padding: "6px 16px",
                    fontSize: "16px",
                    fontWeight: 700,
                  }}
                >
                  {state.codeCardStyle === "changelog"
                    ? state.changelogVersion || "v2.4.0"
                    : state.codeFilename || "prettylink.config.ts"}
                </span>
                <span style={{ fontSize: "16px", opacity: 0.65 }}>
                  {state.codeCardStyle === "changelog"
                    ? state.changelogDate || "Just Shipped"
                    : state.codeLanguage.toUpperCase()}
                </span>
              </div>
              <span style={{ fontSize: "16px", opacity: 0.55 }}>
                {displayUrl}
              </span>
            </div>
            <div
              style={{
                fontSize: "28px",
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              {state.codeCardStyle === "changelog"
                ? state.changelogTitle ||
                  "Interactive Stage & Duo Device Showcases"
                : (state.codeContent || "").split("\n")[0] ||
                  "PrettyLink Code Showcase"}
            </div>
          </div>
        ) : state.mode === "social" ? (
          <div
            style={{
              width: "760px",
              display: "flex",
              flexDirection: "column",
              background:
                state.socialCardTheme === "dark" ? "#111115" : "#FFFFFF",
              color:
                state.socialCardTheme === "dark" ? "#FAFAFA" : "#09090B",
              borderRadius: "32px",
              padding: "32px 36px",
              boxShadow: "0 28px 64px rgba(0, 0, 0, 0.38)",
              border: "1px solid rgba(255, 255, 255, 0.16)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                width: "100%",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "20px",
                }}
              >
                <div
                  style={{
                    width: "76px",
                    height: "76px",
                    borderRadius: "999px",
                    background: platform.accent,
                    color: "#FFFFFF",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "34px",
                    fontWeight: 700,
                  }}
                >
                  {(state.socialDisplayName || "O").charAt(0).toUpperCase()}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      fontSize: "30px",
                      fontWeight: 700,
                    }}
                  >
                    <span>{state.socialDisplayName || "Olivia Rhye"}</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      fontSize: "19px",
                      opacity: 0.65,
                    }}
                  >
                    {socialHandleRowText}
                  </div>
                </div>
              </div>

              <div
                style={{
                  background: platform.accent,
                  color: "#FFFFFF",
                  borderRadius: "999px",
                  padding: "12px 26px",
                  fontSize: "18px",
                  fontWeight: 700,
                }}
              >
                {state.socialCtaLabel || platform.defaultCta}
              </div>
            </div>

            {state.socialBio ? (
              <div
                style={{
                  marginTop: "18px",
                  fontSize: "20px",
                  lineHeight: 1.4,
                  opacity: 0.82,
                }}
              >
                {state.socialBio.slice(0, 140)}
              </div>
            ) : null}

            {stats.length > 0 ? (
              <div
                style={{
                  marginTop: "22px",
                  paddingTop: "18px",
                  borderTop:
                    state.socialCardTheme === "dark"
                      ? "1px solid rgba(255, 255, 255, 0.1)"
                      : "1px solid rgba(9, 9, 11, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-around",
                  width: "100%",
                }}
              >
                {stats.map((stat, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: "24px", fontWeight: 700 }}>
                      {stat.value}
                    </span>
                    <span style={{ fontSize: "15px", opacity: 0.6 }}>
                      {stat.label}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div
            style={{
              width: "860px",
              display: "flex",
              flexDirection: "column",
              background: isDarkChrome ? "#18181B" : "#FFFFFF",
              color: isDarkChrome ? "#F4F4F5" : "#18181B",
              borderRadius: "28px",
              overflow: "hidden",
              boxShadow: "0 28px 64px rgba(0, 0, 0, 0.38)",
              border: "1px solid rgba(255, 255, 255, 0.18)",
            }}
          >
            {/* Top Browser Tab Bar */}
            <div
              style={{
                width: "100%",
                height: "54px",
                background: "#121216",
                display: "flex",
                alignItems: "center",
                padding: "0 22px",
                gap: "12px",
              }}
            >
              <div style={{ display: "flex", gap: "8px" }}>
                <div
                  style={{
                    width: "13px",
                    height: "13px",
                    borderRadius: "999px",
                    background: "#FF5F57",
                  }}
                />
                <div
                  style={{
                    width: "13px",
                    height: "13px",
                    borderRadius: "999px",
                    background: "#FEBC2E",
                  }}
                />
                <div
                  style={{
                    width: "13px",
                    height: "13px",
                    borderRadius: "999px",
                    background: "#28C840",
                  }}
                />
              </div>

              <div
                style={{
                  marginLeft: "14px",
                  background: isDarkChrome ? "#18181B" : "#FFFFFF",
                  color: isDarkChrome ? "#F4F4F5" : "#18181B",
                  padding: "8px 20px",
                  borderTopLeftRadius: "12px",
                  borderTopRightRadius: "12px",
                  fontSize: "16px",
                  fontWeight: 600,
                  marginTop: "10px",
                }}
              >
                {state.tabTitle.trim() || displayUrl}
              </div>
            </div>

            {/* Browser Address Bar & Preview Body */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                padding: "24px 28px 32px",
                gap: "22px",
              }}
            >
              <div
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  background: isDarkChrome
                    ? "rgba(255, 255, 255, 0.08)"
                    : "rgba(9, 9, 11, 0.05)",
                  border: `2px solid ${accentColor}`,
                  borderRadius: "16px",
                  padding: "14px 20px",
                  fontSize: "22px",
                  fontWeight: 600,
                }}
              >
                <div
                  style={{
                    width: "14px",
                    height: "14px",
                    borderRadius: "999px",
                    background: accentColor,
                  }}
                />
                <span>{addressUrlText}</span>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  padding: "8px 4px 0",
                }}
              >
                <div
                  style={{
                    fontSize: "32px",
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {state.tabTitle.trim() || displayUrl}
                </div>
                <div
                  style={{
                    display: "flex",
                    fontSize: "18px",
                    opacity: 0.65,
                  }}
                >
                  {webSublineText}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer Row */}
        <div
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "17px",
            fontWeight: 600,
            opacity: 0.88,
          }}
        >
          {state.showPosterFooter && state.posterFooterTitle.trim()
            ? `${state.posterFooterTitle.trim()}${state.posterFooterSubtitle.trim() ? ` · ${state.posterFooterSubtitle.trim()}` : ""}`
            : displayUrl}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      ...(fonts.length > 0 ? { fonts } : {}),
    }
  )
}

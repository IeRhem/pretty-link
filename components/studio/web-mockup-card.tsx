"use client"

import * as React from "react"
import {
  IconArrowUpRight,
  IconChevronLeft,
  IconChevronRight,
  IconDotsVertical,
  IconHome,
  IconLock,
  IconPlus,
  IconRefresh,
  IconWorld,
  IconX,
} from "@tabler/icons-react"
import { QrCodeSvg } from "@/components/studio/qr-code-svg"
import { getFontStyleCssFamily } from "@/lib/presets"
import type { StudioState } from "@/lib/studio-types"
import { formatDisplayUrl, normalizeUrl, validatePublicUrl } from "@/lib/url-utils"
import { cn } from "@/lib/utils"

const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

export function resolveTabAccentColor(state: StudioState): string {
  const custom =
    typeof state.tabAccentColor === "string"
      ? state.tabAccentColor.trim()
      : ""
  if (HEX_COLOR_RE.test(custom)) return custom

  const theme =
    typeof state.metadata?.themeColor === "string"
      ? state.metadata.themeColor.trim()
      : ""
  if (theme && HEX_COLOR_RE.test(theme)) return theme

  if (state.backgroundType === "color") {
    const rawBgHex =
      state.colorFillMode === "solid" ? state.solidColor : state.gradientFrom
    const bgHex = typeof rawBgHex === "string" ? rawBgHex.trim() : ""
    if (HEX_COLOR_RE.test(bgHex)) return bgHex
  }

  return "#38A869"
}

function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.trim().replace(/^#/, "")
  let r = 56
  let g = 168
  let b = 105
  if (clean.length === 3) {
    r = parseInt(clean[0]! + clean[0]!, 16)
    g = parseInt(clean[1]! + clean[1]!, 16)
    b = parseInt(clean[2]! + clean[2]!, 16)
  } else if (clean.length === 6) {
    r = parseInt(clean.slice(0, 2), 16)
    g = parseInt(clean.slice(2, 4), 16)
    b = parseInt(clean.slice(4, 6), 16)
  }
  if ([r, g, b].some((n) => Number.isNaN(n))) {
    return [56, 168, 105]
  }
  return [r, g, b]
}

export function hexToTintRgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHexRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function getRelativeLuminance([r, g, b]: readonly [number, number, number]): number {
  const toLinear = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

function getContrastRatio(
  rgbA: readonly [number, number, number],
  rgbB: readonly [number, number, number]
): number {
  const lumA = getRelativeLuminance(rgbA)
  const lumB = getRelativeLuminance(rgbB)
  const lighter = Math.max(lumA, lumB)
  const darker = Math.min(lumA, lumB)
  return (lighter + 0.05) / (darker + 0.05)
}

export function resolveTabUrlForeground(
  accentColor: string,
  isDarkChrome: boolean,
  isGlassChrome = false
): string {
  const accentRgb = parseHexRgb(accentColor)
  // Glass Header uses a translucent bar (rgba(255, 255, 255, 0.95));
  // evaluate against the darkest supported backdrop (#000000 => 242) as well as white (#FFFFFF => 255).
  const baseRgb: readonly [number, number, number] = isDarkChrome
    ? [24, 24, 27]
    : isGlassChrome
      ? [242, 242, 242]
      : [255, 255, 255]
  const alpha = isDarkChrome ? 0.18 : 0.1
  const pillRgb: [number, number, number] = [
    accentRgb[0] * alpha + baseRgb[0] * (1 - alpha),
    accentRgb[1] * alpha + baseRgb[1] * (1 - alpha),
    accentRgb[2] * alpha + baseRgb[2] * (1 - alpha),
  ]

  let passes = getContrastRatio(accentRgb, pillRgb) >= 4.5
  if (passes && !isDarkChrome && isGlassChrome) {
    const lightPillRgb: [number, number, number] = [
      accentRgb[0] * alpha + 255 * (1 - alpha),
      accentRgb[1] * alpha + 255 * (1 - alpha),
      accentRgb[2] * alpha + 255 * (1 - alpha),
    ]
    passes = getContrastRatio(accentRgb, lightPillRgb) >= 4.5
  }

  if (passes) {
    return accentColor
  }

  return getContrastRatio([244, 244, 245], pillRgb) >=
    getContrastRatio([24, 24, 27], pillRgb)
    ? "#F4F4F5"
    : "#18181B"
}

function countWrappedTextLines(
  text: string,
  maxWidthPx: number,
  approxCharWidthPx: number
): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  if (maxWidthPx <= 0 || approxCharWidthPx <= 0) return 1
  const maxCharsPerLine = Math.max(
    1,
    Math.floor(maxWidthPx / approxCharWidthPx)
  )
  let totalLines = 0
  for (const rawLine of trimmed.split("\n")) {
    const words = rawLine.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      totalLines += 1
      continue
    }
    let lines = 1
    let currentLen = 0
    for (const word of words) {
      if (word.length > maxCharsPerLine) {
        if (currentLen > 0) {
          lines += 1
          currentLen = 0
        }
        lines += Math.floor((word.length - 1) / maxCharsPerLine)
        currentLen = word.length % maxCharsPerLine || maxCharsPerLine
      } else if (currentLen === 0) {
        currentLen = word.length
      } else if (currentLen + 1 + word.length <= maxCharsPerLine) {
        currentLen += 1 + word.length
      } else {
        lines += 1
        currentLen = word.length
      }
    }
    totalLines += lines
  }
  return Math.max(1, totalLines)
}

export function getPosterFooterStackOffset(
  state: StudioState,
  scaleFactor: number,
  canvasWidth = 500 * scaleFactor
): number {
  if (!state.showPosterFooter) return 0
  const hasTitle = Boolean(state.posterFooterTitle.trim())
  const hasSub = Boolean(state.posterFooterSubtitle.trim())
  if (!hasTitle && !hasSub) return 0
  const maxFooterWidth = Math.max(80, Math.round(canvasWidth * 0.84))
  const titleFontSize = Math.round(14 * scaleFactor)
  const subFontSize = Math.round(10.5 * scaleFactor)
  const titleLines = hasTitle
    ? countWrappedTextLines(
        state.posterFooterTitle,
        maxFooterWidth,
        titleFontSize * 0.64
      )
    : 0
  const subLines = hasSub
    ? countWrappedTextLines(
        state.posterFooterSubtitle,
        maxFooterWidth,
        subFontSize * 0.56
      )
    : 0
  const titleH = titleLines * Math.round(14 * scaleFactor * 1.25)
  const subH = subLines * Math.round(10.5 * scaleFactor * 1.25)
  const innerGap = hasTitle && hasSub ? Math.round(2 * scaleFactor) : 0
  const rowGap = Math.round(10 * scaleFactor)
  return titleH + subH + innerGap + rowGap
}

function useFaviconSelection(
  customFaviconUrl: string,
  metadataFaviconUrl: string | null | undefined,
  fetchedAt: string | undefined,
  previewGeneration = 0
) {
  const faviconCandidates = React.useMemo(
    () =>
      [customFaviconUrl, metadataFaviconUrl].filter((v): v is string =>
        Boolean(v)
      ),
    [customFaviconUrl, metadataFaviconUrl]
  )
  const faviconKey = `${previewGeneration}|${fetchedAt ?? ""}|${faviconCandidates.join("|")}`
  const [failedState, setFailedState] = React.useState<{
    key: string
    urls: string[]
  }>({ key: faviconKey, urls: [] })

  const failedFavicons = React.useMemo(
    () => (failedState.key === faviconKey ? failedState.urls : []),
    [failedState, faviconKey]
  )

  const activeFavicon =
    faviconCandidates.find((src) => !failedFavicons.includes(src)) ?? ""

  const markFaviconFailed = React.useCallback(
    (src: string) => {
      if (!src) return
      setFailedState((prev) => {
        const current = prev.key === faviconKey ? prev.urls : []
        if (current.includes(src)) {
          return prev.key === faviconKey ? prev : { key: faviconKey, urls: current }
        }
        return { key: faviconKey, urls: [...current, src] }
      })
    },
    [faviconKey]
  )

  return { activeFavicon, markFaviconFailed }
}

function BrandMarkSvg({
  accentColor,
  monochrome = false,
  className,
  style,
}: {
  accentColor: string
  monochrome?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const badgeFill = monochrome
    ? "rgba(255, 255, 255, 0.22)"
    : hexToTintRgba(accentColor, 0.16)
  const backFacet = monochrome
    ? "rgba(255, 255, 255, 0.36)"
    : hexToTintRgba(accentColor, 0.48)
  const frontFacet = monochrome ? "rgba(255, 255, 255, 0.72)" : accentColor

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <rect x="8" y="8" width="84" height="84" rx="24" fill={badgeFill} />
      <rect x="27" y="27" width="33" height="33" rx="10" fill={backFacet} />
      <rect x="40" y="40" width="33" height="33" rx="10" fill={frontFacet} />
      <rect
        x="45"
        y="45"
        width="10"
        height="10"
        rx="3.5"
        fill="rgba(255, 255, 255, 0.9)"
      />
    </svg>
  )
}

function SolidPadlockSvg({
  color,
  style,
}: {
  color: string
  style?: React.CSSProperties
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      style={style}
      className="shrink-0"
      aria-hidden="true"
    >
      <path
        d="M7.5 10V7.5C7.5 5.01472 9.51472 3 12 3C14.4853 3 16.5 5.01472 16.5 7.5V10"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <rect x="4.5" y="9.5" width="15" height="11.5" rx="3.2" fill={color} />
    </svg>
  )
}

function MobileTuneIconSvg({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.1}
      strokeLinecap="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <line x1="4" y1="8" x2="7" y2="8" />
      <line x1="12" y1="8" x2="20" y2="8" />
      <circle cx="9.5" cy="8" r="2.3" />
      <line x1="4" y1="16" x2="12" y2="16" />
      <line x1="17" y1="16" x2="20" y2="16" />
      <circle cx="14.5" cy="16" r="2.3" />
    </svg>
  )
}

export function PosterOverlays({
  state,
  logicalWidth,
  logicalHeight,
  previewGeneration = 0,
}: {
  state: StudioState
  logicalWidth: number
  logicalHeight: number
  previewGeneration?: number
}) {
  const { activeFavicon, markFaviconFailed } = useFaviconSelection(
    state.customFaviconUrl,
    state.metadata?.faviconUrl,
    state.metadata?.fetchedAt,
    previewGeneration
  )
  const showWebQr = state.mode === "web" && state.webShowQr
  const hasCalloutBadge =
    Boolean(state.showCalloutBadge) && Boolean(state.calloutText?.trim())
  const hasAnyOverlay =
    state.showCornerIcon ||
    hasCalloutBadge ||
    state.showPosterHeader ||
    state.showPosterFooter ||
    showWebQr
  if (!hasAnyOverlay) return null

  const minDim = Math.min(logicalWidth, logicalHeight)
  const scaleFactor = minDim / 500
  const accentColor = resolveTabAccentColor(state)
  const headingFontFamily = getFontStyleCssFamily(state.fontStyle)
  const targetUrl = normalizeUrl(state.url) || "https://www.lerhem.space"
  const qrSize = Math.round(54 * scaleFactor)

  const cornerSize = Math.round(46 * scaleFactor)
  const headlineScale = (state.posterHeadlineSize ?? 100) / 100
  const headlineFontSize = Math.round(42 * scaleFactor * headlineScale)
  const headlineLines = state.posterHeadline.split("\n")
  const hasAccentText = Boolean(state.posterAccentText.trim())
  const hasFooterTitle = Boolean(state.posterFooterTitle.trim())
  const hasFooterSubtitle = Boolean(state.posterFooterSubtitle.trim())
  const hasVisibleFooter =
    state.showPosterFooter && (hasFooterTitle || hasFooterSubtitle)

  const cornerPosStyle: React.CSSProperties =
    state.cornerIconPosition === "top-center"
      ? {
          left: "50%",
          top: "5.5%",
          transform: "translateX(-50%)",
          width: `${cornerSize}px`,
          height: `${cornerSize}px`,
        }
      : state.cornerIconPosition === "top-right"
        ? {
            right: "7.5%",
            top: "5.5%",
            width: `${cornerSize}px`,
            height: `${cornerSize}px`,
          }
        : {
            left: "7.5%",
            top: "5.5%",
            width: `${cornerSize}px`,
            height: `${cornerSize}px`,
          }

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {state.showCornerIcon && (
        <div
          style={cornerPosStyle}
          className="absolute z-0 flex items-center justify-center"
        >
          {activeFavicon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${previewGeneration}-${activeFavicon}`}
              src={activeFavicon}
              alt=""
              onError={() => markFaviconFailed(activeFavicon)}
              style={{ opacity: 0.42, filter: "brightness(1.25)" }}
              className="size-full rounded-xl object-contain"
            />
          ) : (
            <BrandMarkSvg
              accentColor={accentColor}
              monochrome
              className="size-full"
            />
          )}
        </div>
      )}

      {hasCalloutBadge && (() => {
        const pillH = Math.round(26 * scaleFactor)
        const sharesCornerWithIcon =
          state.showCornerIcon &&
          state.cornerIconPosition === state.calloutPosition
        const defaultPillY = sharesCornerWithIcon
          ? Math.round(logicalHeight * 0.055 + cornerSize + Math.round(8 * scaleFactor))
          : Math.round(logicalHeight * 0.055)
        const headlineTopY = Math.round(logicalHeight * 0.17)
        const minHeadlineGap = Math.round(6 * scaleFactor)
        const hasHeadlineText =
          state.showPosterHeader &&
          Boolean(state.posterHeadline.trim() || state.posterAccentText.trim())
        const overlapsHeadline =
          hasHeadlineText && defaultPillY + pillH + minHeadlineGap > headlineTopY
        const resolvedTop = overlapsHeadline
          ? `${Math.max(Math.round(4 * scaleFactor), headlineTopY - pillH - minHeadlineGap)}px`
          : sharesCornerWithIcon
            ? `calc(5.5% + ${cornerSize + Math.round(8 * scaleFactor)}px)`
            : "5.5%"
        const shiftBesideCornerIcon =
          overlapsHeadline &&
          sharesCornerWithIcon &&
          Math.max(Math.round(4 * scaleFactor), headlineTopY - pillH - minHeadlineGap) <
            Math.round(logicalHeight * 0.055) + cornerSize

        return (
          <div
            style={{
              top: resolvedTop,
              ...(state.calloutPosition === "top-center"
                ? shiftBesideCornerIcon
                  ? {
                      left: `calc(50% + ${Math.round(cornerSize / 2 + 10 * scaleFactor)}px)`,
                    }
                  : { left: "50%", transform: "translateX(-50%)" }
                : state.calloutPosition === "top-right"
                  ? {
                      right: shiftBesideCornerIcon
                        ? `calc(7.5% + ${cornerSize + Math.round(10 * scaleFactor)}px)`
                        : "7.5%",
                    }
                  : {
                      left: shiftBesideCornerIcon
                        ? `calc(7.5% + ${cornerSize + Math.round(10 * scaleFactor)}px)`
                        : "7.5%",
                    }),
              height: `${pillH}px`,
              paddingLeft: `${Math.round(9 * scaleFactor)}px`,
              paddingRight: `${Math.round(11 * scaleFactor)}px`,
              gap: `${Math.round(6 * scaleFactor)}px`,
              fontFamily: headingFontFamily,
              ...(shiftBesideCornerIcon && state.calloutPosition === "top-center"
                ? {
                    maxWidth: `calc(46% - ${Math.round(cornerSize / 2 + 10 * scaleFactor)}px)`,
                  }
                : {}),
            }}
            className="absolute z-30 flex max-w-[78%] items-center rounded-full bg-zinc-950/88 text-white shadow-lg ring-1 ring-white/20 backdrop-blur-md"
          >
            <span
              style={{
                width: `${Math.max(5, Math.round(7 * scaleFactor))}px`,
                height: `${Math.max(5, Math.round(7 * scaleFactor))}px`,
                backgroundColor: accentColor,
                boxShadow: `0 0 ${Math.round(8 * scaleFactor)}px ${accentColor}`,
              }}
              className="shrink-0 rounded-full"
            />
            <span
              style={{
                fontSize: `${Math.round(11 * scaleFactor)}px`,
                letterSpacing: "0.02em",
              }}
              className="truncate font-semibold"
            >
              {state.calloutText.trim()}
            </span>
          </div>
        )
      })()}

      {state.showPosterHeader && (
        <div
          style={{
            top: "17%",
            left: "8%",
            right: "8%",
            textAlign: state.posterHeadlineAlign,
            fontSize: `${headlineFontSize}px`,
            lineHeight: 1.08,
            letterSpacing: "-0.03em",
            fontWeight: 500,
            fontFamily: headingFontFamily,
          }}
          className="absolute z-0 font-heading text-white"
        >
          {headlineLines.map((line, idx) => {
            const isLast = idx === headlineLines.length - 1
            return (
              <div key={idx} style={{ minHeight: "1.08em" }}>
                <span>{line}</span>
                {isLast && hasAccentText && (
                  <span style={{ color: "rgba(255, 255, 255, 0.5)" }}>
                    {line ? " " : ""}
                    {state.posterAccentText}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {hasVisibleFooter && (
        <div
          style={{ bottom: "4.5%" }}
          className="absolute inset-x-0 z-20 flex flex-col items-center"
        >
          <div className="flex max-w-[84%] flex-col items-center text-center">
            {hasFooterTitle && (
              <div
                style={{
                  fontSize: `${Math.round(14 * scaleFactor)}px`,
                  lineHeight: 1.25,
                  letterSpacing: "0.06em",
                  fontFamily: headingFontFamily,
                }}
                className="font-heading font-bold text-white"
              >
                {state.posterFooterTitle}
              </div>
            )}
            {hasFooterSubtitle && (
              <div
                style={{
                  fontSize: `${Math.round(10.5 * scaleFactor)}px`,
                  lineHeight: 1.25,
                  marginTop: hasFooterTitle
                    ? `${Math.round(2 * scaleFactor)}px`
                    : undefined,
                  color: "rgba(255, 255, 255, 0.75)",
                }}
                className="font-medium"
              >
                {state.posterFooterSubtitle}
              </div>
            )}
          </div>
        </div>
      )}

      {showWebQr && (
        <div
          style={{
            right: "4.5%",
            bottom: "4.5%",
            width: `${qrSize}px`,
            height: `${qrSize}px`,
          }}
          className="absolute z-20 rounded-2xl bg-white/95 p-1.5 shadow-lg ring-1 ring-black/10"
        >
          <QrCodeSvg
            value={targetUrl}
            className="size-full rounded-none bg-transparent p-0 shadow-none ring-0"
          />
        </div>
      )}
    </div>
  )
}

export function WebMockupCard({
  state,
  logicalWidth,
  logicalHeight,
  isFetching = false,
  previewGeneration = 0,
}: {
  state: StudioState
  logicalWidth: number
  logicalHeight: number
  isFetching?: boolean
  previewGeneration?: number
}) {
  const failureScopeKey = `${previewGeneration}|${state.metadata?.fetchedAt ?? ""}|${state.url}`
  const [loadedSrc, setLoadedSrc] = React.useState<string | null>(null)
  const [failedState, setFailedState] = React.useState<{
    scopeKey: string
    urls: string[]
  }>({ scopeKey: failureScopeKey, urls: [] })
  const failedUrls = React.useMemo(
    () => (failedState.scopeKey === failureScopeKey ? failedState.urls : []),
    [failedState, failureScopeKey]
  )
  const [loadedIframeToken, setLoadedIframeToken] = React.useState<{
    key: string
  } | null>(null)
  const viewportRef = React.useRef<HTMLDivElement>(null)
  const [viewportSize, setViewportSize] = React.useState({ width: 440, height: 320 })
  const displayUrl = formatDisplayUrl(state.url)
  const { activeFavicon, markFaviconFailed } = useFaviconSelection(
    state.customFaviconUrl,
    state.metadata?.faviconUrl,
    state.metadata?.fetchedAt,
    previewGeneration
  )

  React.useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const update = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        setViewportSize({ width: el.clientWidth, height: el.clientHeight })
      }
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [state.webLayout])

  const liveIframeUrl = React.useMemo(() => {
    const check = validatePublicUrl(state.url)
    return check.ok ? check.url.toString() : null
  }, [state.url])

  const isDarkChrome = state.chromeTheme === "dark"
  const isGlassChrome = state.chromeTheme === "glass"

  const themedScreenshotUrl = React.useMemo(() => {
    const raw = state.metadata?.screenshotUrl
    if (!raw) return null
    const sep = raw.includes("?") ? "&" : "?"
    return `${raw}${sep}theme=${isDarkChrome ? "dark" : "light"}`
  }, [state.metadata?.screenshotUrl, isDarkChrome])

  const generatedMobileScreenshotUrl = React.useMemo(() => {
    const raw = state.metadata?.screenshotUrl
    if (!raw) return null
    const sep = raw.includes("?") ? "&" : "?"
    return `${raw}${sep}theme=${isDarkChrome ? "dark" : "light"}&viewport=mobile`
  }, [state.metadata?.screenshotUrl, isDarkChrome])

  const mobileCandidates = React.useMemo(
    () =>
      [state.customMobileScreenshotUrl, generatedMobileScreenshotUrl].filter(
        (v): v is string => Boolean(v)
      ),
    [state.customMobileScreenshotUrl, generatedMobileScreenshotUrl]
  )

  const candidates = React.useMemo(
    () =>
      [
        state.customScreenshotUrl,
        themedScreenshotUrl,
        state.metadata?.ogImageUrl,
      ].filter((v): v is string => Boolean(v)),
    [
      state.customScreenshotUrl,
      themedScreenshotUrl,
      state.metadata?.ogImageUrl,
    ]
  )

  const activeImage = candidates.find((src) => !failedUrls.includes(src)) ?? ""
  const activeMobileImage =
    mobileCandidates.find((src) => !failedUrls.includes(src)) ?? activeImage
  const imageReady = Boolean(activeImage) && loadedSrc === activeImage
  const isIframeMounted = Boolean(
    liveIframeUrl &&
      !state.customScreenshotUrl &&
      state.webLayout !== "tab"
  )
  const currentIframeKey =
    isIframeMounted && liveIframeUrl
      ? `${liveIframeUrl}:${previewGeneration}:${isDarkChrome ? "dark" : "light"}`
      : ""
  const iframeInstanceToken = React.useMemo(
    () => (currentIframeKey ? { key: currentIframeKey } : null),
    [currentIframeKey]
  )
  const iframeReady =
    Boolean(iframeInstanceToken) && loadedIframeToken === iframeInstanceToken
  const showLoadingHint =
    isFetching || (Boolean(activeImage) && !imageReady && !iframeReady)

  const iframeScale = Math.max(0.15, viewportSize.width / 1280)
  const iframeHeight = Math.max(
    900,
    Math.round(viewportSize.height / iframeScale)
  )

  const markFailed = React.useCallback(
    (src: string) => {
      setFailedState((prev) => {
        const currentUrls =
          prev.scopeKey === failureScopeKey ? prev.urls : []
        if (currentUrls.includes(src)) {
          return prev.scopeKey === failureScopeKey
            ? prev
            : { scopeKey: failureScopeKey, urls: currentUrls }
        }
        return {
          scopeKey: failureScopeKey,
          urls: [...currentUrls, src],
        }
      })
    },
    [failureScopeKey]
  )

  const minDim = Math.min(logicalWidth, logicalHeight)
  const scaleFactor = minDim / 500
  const userScale = state.frameScale / 100
  const isDefaultLerhem = displayUrl.toLowerCase().includes("lerhem.space")
  const accentColor = resolveTabAccentColor(state)

  const shadowAlpha = 0.14 + (state.frameShadow / 100) * 0.44
  const shadowBlur = Math.round(44 * scaleFactor * (state.frameShadow / 100))
  const shadowY = Math.round(20 * scaleFactor * (state.frameShadow / 100))

  const frameBoxStyle = React.useMemo((): React.CSSProperties => {
    const base: React.CSSProperties = {
      boxShadow:
        state.frameShadow > 0
          ? `0 ${shadowY}px ${shadowBlur}px rgba(9, 9, 14, ${shadowAlpha})`
          : "none",
    }
    const offX = state.frameOffsetX ?? 0
    const offY = state.frameOffsetY ?? 0

    if (state.webLayout === "tab") {
      return {
        ...base,
        position: "absolute",
        left: `${50 + offX}%`,
        top: `${56 + offY}%`,
        transform: `translate(-50%, -50%) scale(${userScale})`,
        width: "88%",
        borderRadius: `${Math.round(20 * scaleFactor)}px`,
      }
    }

    if (state.webLayout === "offset") {
      const baseLeftPct = 11 + (1 - userScale) * 24
      const baseTopPct = 26.5 + (1 - userScale) * 20
      return {
        ...base,
        position: "absolute",
        left: `${baseLeftPct + offX}%`,
        top: `${baseTopPct + offY}%`,
        width: `${100 - baseLeftPct + 2}%`,
        height: `${100 - baseTopPct + 2}%`,
        borderTopLeftRadius: `${Math.round(22 * scaleFactor)}px`,
      }
    }

    if (state.webLayout === "centered") {
      return {
        ...base,
        position: "absolute",
        left: `${50 + offX}%`,
        top: `${50 + offY}%`,
        transform: `translate(-50%, -50%) scale(${userScale})`,
        width: "84%",
        height: "74%",
        borderRadius: `${Math.round(16 * scaleFactor)}px`,
      }
    }

    if (state.webLayout === "docked") {
      return {
        ...base,
        position: "absolute",
        left: `${50 + offX}%`,
        bottom: `${-offY}%`,
        transform: `translateX(-50%) scale(${userScale})`,
        transformOrigin: "bottom center",
        width: "86%",
        height: "82%",
        borderTopLeftRadius: `${Math.round(18 * scaleFactor)}px`,
        borderTopRightRadius: `${Math.round(18 * scaleFactor)}px`,
      }
    }

    if (state.webLayout === "duo") {
      return {
        ...base,
        position: "absolute",
        left: `${45 + offX}%`,
        top: `${47 + offY}%`,
        transform: `translate(-50%, -50%) scale(${userScale})`,
        width: "78%",
        height: "68%",
        borderRadius: `${Math.round(16 * scaleFactor)}px`,
      }
    }

    // floating
    return {
      ...base,
      position: "absolute",
      left: `${50 + offX}%`,
      top: `${50 + offY}%`,
      transform: `translate(-50%, -50%) scale(${userScale * 0.92})`,
      width: "80%",
      height: "70%",
      borderRadius: `${Math.round(20 * scaleFactor)}px`,
    }
  }, [
    state.webLayout,
    state.frameShadow,
    state.frameOffsetX,
    state.frameOffsetY,
    userScale,
    scaleFactor,
    shadowAlpha,
    shadowBlur,
    shadowY,
  ])

  const renderChrome = () => {
    if (state.browserChrome === "none") return null

    if (state.browserChrome === "chrome") {
      const tabH = Math.round(28 * scaleFactor)
      return (
        <div className="shrink-0 select-none">
          {/* Top dark window bar with curved active tab */}
          <div
            className={cn(
              "relative flex items-end px-4",
              isDarkChrome
                ? "bg-[#0d0d10]"
                : isGlassChrome
                  ? "bg-zinc-900/75 backdrop-blur-md"
                  : "bg-[#121215]"
            )}
            style={{ height: `${Math.round(36 * scaleFactor)}px` }}
          >
            <div
              style={{ height: `${tabH}px` }}
              className="flex shrink-0 items-center gap-1.5"
            >
              <span className="size-2.5 rounded-full bg-zinc-700" />
              <span className="size-2.5 rounded-full bg-zinc-700" />
              <span className="size-2.5 rounded-full bg-zinc-700" />
            </div>
            <div
              style={{ height: `${tabH}px` }}
              className={cn(
                "relative ml-4 flex min-w-[36%] max-w-[56%] items-center gap-1.5 rounded-t-[10px] pr-2 pl-3",
                isDarkChrome
                  ? "bg-[#18181b] text-zinc-200"
                  : isGlassChrome
                    ? "bg-white/92 text-zinc-900"
                    : "bg-white text-zinc-900"
              )}
            >
              {activeFavicon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${previewGeneration}-${activeFavicon}`}
                  src={activeFavicon}
                  alt=""
                  onError={() => markFaviconFailed(activeFavicon)}
                  className="size-3 shrink-0 rounded-xs object-contain"
                />
              ) : (
                <BrandMarkSvg
                  accentColor={accentColor}
                  className="size-3 shrink-0"
                />
              )}
              <span className="truncate text-[10px] font-medium opacity-85">
                {state.tabTitle.trim() ||
                  state.metadata?.siteName ||
                  (isDefaultLerhem ? "Lerhem" : displayUrl)}
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "ml-auto flex size-4 shrink-0 items-center justify-center rounded-full",
                  isDarkChrome
                    ? "bg-white/10 text-zinc-300"
                    : "bg-black/6 text-zinc-600"
                )}
              >
                <IconX className="size-2.5" stroke={2.4} />
              </span>
            </div>

            <div
              style={{ height: `${tabH}px` }}
              className="ml-2 flex shrink-0 items-center"
            >
              <span
                aria-hidden="true"
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/85"
              >
                <IconPlus className="size-3" stroke={2.2} />
              </span>
            </div>
          </div>

          {/* Navigation bar */}
          <div
            className={cn(
              "flex items-center gap-2.5 border-b px-3.5",
              isDarkChrome
                ? "border-zinc-800 bg-[#18181b] text-zinc-300"
                : isGlassChrome
                  ? "border-black/5 bg-white/92 text-zinc-800 backdrop-blur-md"
                  : "border-zinc-200/80 bg-white text-zinc-900"
            )}
            style={{ height: `${Math.round(44 * scaleFactor)}px` }}
          >
            {state.showNavButtons && (
              <div className="flex shrink-0 items-center gap-2">
                <IconChevronLeft className="size-4" stroke={1.8} />
                <IconChevronRight className="size-4 opacity-30" stroke={1.8} />
                <IconRefresh className="size-3.5" stroke={1.9} />
                <IconHome className="size-3.5" stroke={1.9} />
              </div>
            )}

            <div
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1",
                isDarkChrome
                  ? "bg-zinc-800 text-zinc-100"
                  : "bg-zinc-100 text-zinc-800 ring-1 ring-black/5"
              )}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-md",
                  isDarkChrome ? "bg-white/12" : "bg-black/5"
                )}
              >
                <IconLock
                  className={cn(
                    "size-3",
                    isDarkChrome ? "text-zinc-200" : "text-zinc-600"
                  )}
                  stroke={2}
                />
              </span>
              <span className="truncate text-xs font-medium tracking-tight">
                {displayUrl}
              </span>
            </div>
          </div>
        </div>
      )
    }

    if (state.browserChrome === "safari" || state.browserChrome === "arc") {
      return (
        <div
          className={cn(
            "flex shrink-0 items-center justify-between border-b px-3.5 select-none",
            isDarkChrome
              ? "border-zinc-800 bg-[#18181b] text-zinc-200"
              : isGlassChrome
                ? "border-white/20 bg-white/75 text-zinc-900 backdrop-blur-md"
                : "border-zinc-200 bg-zinc-100 text-zinc-900"
          )}
          style={{ height: `${Math.round(40 * scaleFactor)}px` }}
        >
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-[#FF5F57]" />
            <span className="size-2.5 rounded-full bg-[#FEBC2E]" />
            <span className="size-2.5 rounded-full bg-[#28C840]" />
          </div>

          <div
            className={cn(
              "mx-3 flex max-w-[65%] flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1 text-[11px] font-medium",
              isDarkChrome
                ? "bg-zinc-800/90 text-zinc-200"
                : "bg-white text-zinc-700 shadow-2xs ring-1 ring-black/5"
            )}
          >
            <IconLock className="size-3 shrink-0 opacity-60" stroke={2} />
            <span className="truncate">{displayUrl}</span>
          </div>

          <div className="w-8 shrink-0" />
        </div>
      )
    }

    if (state.browserChrome === "mobile") {
      return (
        <div
          className={cn(
            "flex shrink-0 items-center gap-2.5 border-b px-3 select-none",
            isDarkChrome
              ? "border-zinc-800 bg-[#18181b] text-zinc-100"
              : isGlassChrome
                ? "border-black/5 bg-white/92 text-zinc-900 backdrop-blur-md"
                : "border-zinc-200/80 bg-white text-zinc-900"
          )}
          style={{ height: `${Math.round(46 * scaleFactor)}px` }}
        >
          {state.showNavButtons && (
            <IconHome className="size-4 shrink-0 opacity-85" stroke={1.9} />
          )}

          <div
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 rounded-full px-3 py-1.5",
              isDarkChrome
                ? "bg-zinc-800 text-zinc-100"
                : "bg-zinc-100 text-zinc-900 ring-1 ring-black/5"
            )}
          >
            <MobileTuneIconSvg className="size-3.5 shrink-0 opacity-75" />
            <span className="truncate text-xs font-medium tracking-tight">
              {displayUrl}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <IconPlus className="size-4 opacity-85" stroke={2} />
            <span className="flex size-4 items-center justify-center rounded-[4px] border-[1.5px] border-current text-[9px] leading-none font-bold opacity-85">
              1
            </span>
            <IconDotsVertical className="size-4 opacity-85" stroke={2} />
          </div>
        </div>
      )
    }

    // minimal
    return (
      <div
        className={cn(
          "flex shrink-0 items-center gap-1.5 border-b px-3.5 select-none",
          isDarkChrome
            ? "border-zinc-800 bg-[#141417]"
            : "border-zinc-200/80 bg-zinc-50"
        )}
        style={{ height: `${Math.round(28 * scaleFactor)}px` }}
      >
        <span className="size-2 rounded-full bg-zinc-400/60" />
        <span className="size-2 rounded-full bg-zinc-400/60" />
        <span className="size-2 rounded-full bg-zinc-400/60" />
      </div>
    )
  }

  if (state.webLayout === "tab") {
    if (state.browserChrome === "mobile") {
      const barH = Math.round(64 * scaleFactor)
      const pillH = Math.round(40 * scaleFactor)
      const barBg = isDarkChrome
        ? "#18181B"
        : isGlassChrome
          ? "rgba(255, 255, 255, 0.95)"
          : "#FFFFFF"
      const pillBg = isDarkChrome ? "#27272A" : "#F4F4F5"
      const fgColor = isDarkChrome ? "#F4F4F5" : "#18181B"

      return (
        <div
          style={{
            ...frameBoxStyle,
            height: `${barH}px`,
            backgroundColor: barBg,
            color: fgColor,
            paddingLeft: `${Math.round(16 * scaleFactor)}px`,
            paddingRight: `${Math.round(16 * scaleFactor)}px`,
            gap: `${Math.round(12 * scaleFactor)}px`,
          }}
          className={cn(
            "relative z-10 flex items-center overflow-hidden ring-1 ring-black/10 select-none",
            isGlassChrome && "backdrop-blur-xl"
          )}
        >
          {state.showNavButtons && (
            <IconHome
              style={{
                width: `${Math.round(20 * scaleFactor)}px`,
                height: `${Math.round(20 * scaleFactor)}px`,
              }}
              className="shrink-0 opacity-85"
              stroke={1.9}
            />
          )}

          <div
            style={{
              height: `${pillH}px`,
              backgroundColor: pillBg,
              paddingLeft: `${Math.round(14 * scaleFactor)}px`,
              paddingRight: `${Math.round(14 * scaleFactor)}px`,
              gap: `${Math.round(9 * scaleFactor)}px`,
            }}
            className={cn(
              "flex min-w-0 flex-1 items-center rounded-full",
              !isDarkChrome && "ring-1 ring-black/5"
            )}
          >
            <MobileTuneIconSvg
              style={{
                width: `${Math.round(16 * scaleFactor)}px`,
                height: `${Math.round(16 * scaleFactor)}px`,
              }}
              className="shrink-0 opacity-75"
            />
            <span
              style={{
                fontSize: `${Math.round(15 * scaleFactor)}px`,
                letterSpacing: "-0.01em",
              }}
              className="min-w-0 flex-1 truncate font-medium"
            >
              {displayUrl}
            </span>
          </div>

          <div
            style={{ gap: `${Math.round(12 * scaleFactor)}px` }}
            className="flex shrink-0 items-center"
          >
            <IconPlus
              style={{
                width: `${Math.round(20 * scaleFactor)}px`,
                height: `${Math.round(20 * scaleFactor)}px`,
              }}
              className="opacity-85"
              stroke={2}
            />
            <span
              style={{
                width: `${Math.round(19 * scaleFactor)}px`,
                height: `${Math.round(19 * scaleFactor)}px`,
                fontSize: `${Math.round(10.5 * scaleFactor)}px`,
              }}
              className="flex items-center justify-center rounded-[5px] border-[1.75px] border-current leading-none font-bold opacity-85"
            >
              1
            </span>
            <IconDotsVertical
              style={{
                width: `${Math.round(19 * scaleFactor)}px`,
                height: `${Math.round(19 * scaleFactor)}px`,
              }}
              className="opacity-85"
              stroke={2}
            />
          </div>
        </div>
      )
    }

    const tabBarH = Math.round(46 * scaleFactor)
    const navBarH = Math.round(58 * scaleFactor)
    const tabHeight = Math.round(38 * scaleFactor)
    const tabRadius = Math.round(12 * scaleFactor)
    const filletSize = Math.round(8 * scaleFactor)
    const dotSize = Math.round(10 * scaleFactor)
    const dotGap = Math.round(6 * scaleFactor)
    const iconSize = Math.round(18 * scaleFactor)
    const closeBtnSize = Math.round(18 * scaleFactor)
    const plusBtnSize = Math.round(22 * scaleFactor)
    const navIconSize = Math.round(16 * scaleFactor)
    const pillHeight = Math.round(38 * scaleFactor)
    const pillRadius = Math.round(12 * scaleFactor)
    const lockSize = Math.round(14 * scaleFactor)

    const stripBg = isDarkChrome
      ? "#0D0D10"
      : isGlassChrome
        ? "rgba(20, 20, 24, 0.84)"
        : "#141418"
    const tabBg = isDarkChrome
      ? "#18181B"
      : isGlassChrome
        ? "rgba(255, 255, 255, 0.95)"
        : "#FFFFFF"
    const tabTitleText =
      state.tabTitle.trim() ||
      state.metadata?.siteName ||
      (isDefaultLerhem ? "Lerhem Studio" : displayUrl)
    const urlPillBg = hexToTintRgba(accentColor, isDarkChrome ? 0.18 : 0.1)
    const urlPillBorder = hexToTintRgba(accentColor, isDarkChrome ? 0.28 : 0.18)
    const urlFgColor = resolveTabUrlForeground(
      accentColor,
      isDarkChrome,
      isGlassChrome
    )
    const navIconColor = isDarkChrome ? "#E4E4E7" : "#18181B"

    return (
      <div
        style={frameBoxStyle}
        className={cn(
          "relative z-10 flex flex-col overflow-hidden ring-1 ring-black/10 select-none",
          isGlassChrome && "backdrop-blur-xl"
        )}
      >
        {/* Top Tab Strip */}
        <div
          style={{
            height: `${tabBarH}px`,
            backgroundColor: stripBg,
            paddingLeft: `${Math.round(16 * scaleFactor)}px`,
            paddingRight: `${Math.round(16 * scaleFactor)}px`,
          }}
          className="relative flex shrink-0 items-end"
        >
          {/* 3 window dots */}
          <div
            style={{ height: `${tabHeight}px`, gap: `${dotGap}px` }}
            className="flex shrink-0 items-center"
          >
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  width: `${dotSize}px`,
                  height: `${dotSize}px`,
                  backgroundColor: "#52525B",
                }}
                className="rounded-full"
              />
            ))}
          </div>

          {/* Active Tab with concave bottom fillets */}
          <div
            style={{
              marginLeft: `${Math.round(14 * scaleFactor)}px`,
              height: `${tabHeight}px`,
              backgroundColor: tabBg,
              borderTopLeftRadius: `${tabRadius}px`,
              borderTopRightRadius: `${tabRadius}px`,
              paddingLeft: `${Math.round(12 * scaleFactor)}px`,
              paddingRight: `${Math.round(12 * scaleFactor)}px`,
              gap: `${Math.round(8 * scaleFactor)}px`,
            }}
            className="relative flex min-w-0 items-center"
          >
            {/* Bottom-left concave fillet */}
            <svg
              viewBox="0 0 16 16"
              style={{
                left: `-${filletSize}px`,
                width: `${filletSize}px`,
                height: `${filletSize}px`,
              }}
              className="pointer-events-none absolute bottom-0 block"
              aria-hidden="true"
            >
              <path d="M 16 0 L 16 16 L 0 16 A 16 16 0 0 0 16 0 Z" fill={tabBg} />
            </svg>

            {/* Bottom-right concave fillet */}
            <svg
              viewBox="0 0 16 16"
              style={{
                right: `-${filletSize}px`,
                width: `${filletSize}px`,
                height: `${filletSize}px`,
              }}
              className="pointer-events-none absolute bottom-0 block"
              aria-hidden="true"
            >
              <path d="M 0 0 L 0 16 L 16 16 A 16 16 0 0 1 0 0 Z" fill={tabBg} />
            </svg>

            {activeFavicon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${previewGeneration}-${activeFavicon}`}
                src={activeFavicon}
                alt=""
                onError={() => markFaviconFailed(activeFavicon)}
                style={{ width: `${iconSize}px`, height: `${iconSize}px` }}
                className="shrink-0 rounded-sm object-contain"
              />
            ) : (
              <BrandMarkSvg
                accentColor={accentColor}
                style={{ width: `${iconSize}px`, height: `${iconSize}px` }}
                className="shrink-0"
              />
            )}

            <span
              style={{
                fontSize: `${Math.round(13 * scaleFactor)}px`,
                color: isDarkChrome ? "#F4F4F5" : "#18181B",
                maxWidth: `${Math.round(180 * scaleFactor)}px`,
              }}
              className="truncate font-semibold tracking-tight"
            >
              {tabTitleText}
            </span>

            <span
              aria-hidden="true"
              style={{
                width: `${closeBtnSize}px`,
                height: `${closeBtnSize}px`,
                backgroundColor: isDarkChrome
                  ? "rgba(255, 255, 255, 0.1)"
                  : "rgba(0, 0, 0, 0.06)",
                color: isDarkChrome ? "#E4E4E7" : "#27272A",
              }}
              className="flex shrink-0 items-center justify-center rounded-full"
            >
              <IconX
                style={{
                  width: `${Math.round(11 * scaleFactor)}px`,
                  height: `${Math.round(11 * scaleFactor)}px`,
                }}
                stroke={2.4}
              />
            </span>
          </div>

          {/* New tab + button */}
          <div
            style={{
              height: `${tabHeight}px`,
              marginLeft: `${Math.round(10 * scaleFactor)}px`,
            }}
            className="flex shrink-0 items-center"
          >
            <span
              aria-hidden="true"
              style={{
                width: `${plusBtnSize}px`,
                height: `${plusBtnSize}px`,
                backgroundColor: "rgba(255, 255, 255, 0.12)",
                color: "rgba(255, 255, 255, 0.9)",
              }}
              className="flex shrink-0 items-center justify-center rounded-full"
            >
              <IconPlus
                style={{
                  width: `${Math.round(13 * scaleFactor)}px`,
                  height: `${Math.round(13 * scaleFactor)}px`,
                }}
                stroke={2.2}
              />
            </span>
          </div>
        </div>

        {/* Bottom Address Bar */}
        <div
          style={{
            height: `${navBarH}px`,
            backgroundColor: tabBg,
            paddingLeft: `${Math.round(14 * scaleFactor)}px`,
            paddingRight: `${Math.round(14 * scaleFactor)}px`,
            gap: `${Math.round(10 * scaleFactor)}px`,
          }}
          className="flex shrink-0 items-center"
        >
          {state.showNavButtons && (
            <div
              style={{
                gap: `${Math.round(6 * scaleFactor)}px`,
                color: navIconColor,
              }}
              className="flex shrink-0 items-center"
            >
              <IconChevronLeft
                style={{ width: `${navIconSize}px`, height: `${navIconSize}px` }}
                className="opacity-75"
                stroke={2}
              />
              <IconChevronRight
                style={{ width: `${navIconSize}px`, height: `${navIconSize}px` }}
                className="opacity-30"
                stroke={2}
              />
            </div>
          )}

          {/* Full-width Address / URL Pill */}
          <div
            style={{
              height: `${pillHeight}px`,
              backgroundColor: urlPillBg,
              border: `1px solid ${urlPillBorder}`,
              borderRadius: `${pillRadius}px`,
              paddingLeft: `${Math.round(12 * scaleFactor)}px`,
              paddingRight: `${Math.round(12 * scaleFactor)}px`,
              gap: `${Math.round(8 * scaleFactor)}px`,
            }}
            className="flex min-w-0 flex-1 items-center"
          >
            <SolidPadlockSvg
              color={urlFgColor}
              style={{ width: `${lockSize}px`, height: `${lockSize}px` }}
            />
            <span
              style={{
                fontSize: `${Math.round(14.5 * scaleFactor)}px`,
                color: urlFgColor,
                letterSpacing: "-0.01em",
              }}
              className="min-w-0 flex-1 truncate font-medium"
            >
              {displayUrl}
            </span>
            <IconArrowUpRight
              style={{
                width: `${Math.round(14 * scaleFactor)}px`,
                height: `${Math.round(14 * scaleFactor)}px`,
                color: urlFgColor,
                opacity: 0.7,
              }}
              className="shrink-0"
              stroke={2.1}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
    <div
      style={frameBoxStyle}
      className={cn(
        "relative z-10 flex flex-col overflow-hidden ring-1 ring-black/15",
        isDarkChrome ? "bg-[#09090b] text-zinc-50" : "bg-white text-zinc-950"
      )}
    >
      {renderChrome()}

      {/* Viewport */}
      <div
        ref={viewportRef}
        style={{ colorScheme: isDarkChrome ? "dark" : "light" }}
        className="relative flex-1 overflow-hidden"
      >
        <div
          className={cn(
            "flex h-full flex-col justify-between p-5",
            isDarkChrome ? "bg-[#0b0b0e] text-zinc-50" : "bg-white text-zinc-950"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {activeFavicon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${previewGeneration}-${activeFavicon}`}
                  src={activeFavicon}
                  alt=""
                  onError={() => markFaviconFailed(activeFavicon)}
                  className="size-4 rounded-xs object-contain"
                />
              ) : (
                <IconWorld className="size-4 opacity-60" />
              )}
              <span className="text-xs font-semibold tracking-tight uppercase opacity-75">
                {state.metadata?.siteName || displayUrl}
              </span>
            </div>
            <span className="rounded-full bg-zinc-500/15 px-2 py-0.5 text-[10px] font-medium">
              Live Link
            </span>
          </div>

          <div className="my-auto space-y-2 py-2">
            <h3 className="line-clamp-2 font-heading text-xl leading-tight font-bold tracking-tight">
              {state.metadata?.title || displayUrl}
            </h3>
            <p className="line-clamp-3 text-xs leading-relaxed opacity-70">
              {state.metadata?.description ||
                "Loading live website preview…"}
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span
              className="inline-flex items-center rounded-full px-3.5 py-1.5 text-[11px] font-semibold text-white"
              style={{ backgroundColor: state.metadata?.themeColor || "#7C3AED" }}
            >
              Visit Website →
            </span>
            <span className="font-mono text-[10px] opacity-45">
              {state.metadata?.domain || displayUrl}
            </span>
          </div>
        </div>

        {liveIframeUrl && !state.customScreenshotUrl && (
          <iframe
            key={currentIframeKey}
            src={liveIframeUrl}
            title={`Live preview of ${displayUrl}`}
            sandbox="allow-scripts allow-same-origin"
            tabIndex={-1}
            onLoad={() => setLoadedIframeToken(iframeInstanceToken)}
            style={{
              width: "1280px",
              height: `${iframeHeight}px`,
              transform: `scale(${iframeScale})`,
              transformOrigin: "top left",
              colorScheme: isDarkChrome ? "dark" : "light",
            }}
            className={cn(
              "pointer-events-none absolute top-0 left-0 z-[5] border-0 transition-opacity duration-300",
              isDarkChrome ? "bg-[#09090b]" : "bg-white",
              iframeReady ? "opacity-100" : "opacity-0"
            )}
          />
        )}

        {activeImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={activeImage}
            alt={`Preview of ${displayUrl}`}
            onLoad={() => setLoadedSrc(activeImage)}
            onError={() => markFailed(activeImage)}
            className={cn(
              "absolute inset-0 z-10 h-full w-full object-cover object-top transition-opacity duration-300",
              imageReady ? "opacity-100" : "opacity-0"
            )}
          />
        )}

        {showLoadingHint && (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 animate-pulse bg-primary" />
            <div className="pointer-events-none absolute right-2.5 bottom-2.5 z-20 rounded-full bg-zinc-950/75 px-2.5 py-1 text-[10px] font-medium text-zinc-100 shadow-sm backdrop-blur-md">
              Loading preview…
            </div>
          </>
        )}
      </div>
    </div>

    {state.webLayout === "duo" && (
      <div
        style={{
          position: "absolute",
          left: `${73 + (state.frameOffsetX ?? 0)}%`,
          top: `${59 + (state.frameOffsetY ?? 0)}%`,
          transform: `translate(-50%, -50%) scale(${userScale})`,
          width: "26.5%",
          height: "64%",
          borderRadius: `${Math.round(22 * scaleFactor)}px`,
          boxShadow:
            state.frameShadow > 0
              ? `0 ${Math.round(shadowY * 1.1)}px ${Math.round(shadowBlur * 1.1)}px rgba(9, 9, 14, ${Math.min(0.75, shadowAlpha + 0.14)})`
              : "none",
        }}
        className={cn(
          "z-20 flex flex-col overflow-hidden border-[3px]",
          isDarkChrome
            ? "border-zinc-800 bg-[#09090b] text-zinc-50 ring-1 ring-white/15"
            : "border-zinc-900 bg-white text-zinc-950 ring-1 ring-black/15"
        )}
      >
        {/* Top Phone Dynamic Island / Notch Header */}
        <div
          className={cn(
            "flex shrink-0 flex-col items-center justify-center gap-1 border-b px-2 pt-1.5 pb-1",
            isDarkChrome
              ? "border-white/8 bg-[#121216]"
              : "border-black/8 bg-zinc-50"
          )}
        >
          <div className="h-1.5 w-9 rounded-full bg-zinc-950 ring-1 ring-white/15" />
          <div
            className={cn(
              "flex w-full items-center justify-center rounded-full px-2 py-0.5 font-mono text-[7.5px] font-medium truncate",
              isDarkChrome
                ? "bg-white/8 text-zinc-300"
                : "bg-black/6 text-zinc-700"
            )}
          >
            <span className="truncate">{displayUrl}</span>
          </div>
        </div>

        {/* Phone Viewport */}
        <div className="relative flex-1 overflow-hidden">
          <div
            className={cn(
              "flex h-full flex-col justify-between p-2.5",
              isDarkChrome
                ? "bg-[#0b0b0e] text-zinc-50"
                : "bg-white text-zinc-950"
            )}
          >
            <span className="truncate text-[8px] font-semibold tracking-wider uppercase opacity-70">
              {state.metadata?.siteName || displayUrl}
            </span>
            <div className="my-auto space-y-1">
              <div className="line-clamp-3 font-heading text-[10px] leading-snug font-bold">
                {state.metadata?.title || displayUrl}
              </div>
              <div className="line-clamp-2 text-[7.5px] leading-tight opacity-65">
                {state.metadata?.description || "Mobile web preview"}
              </div>
            </div>
            <span
              style={{
                backgroundColor: state.metadata?.themeColor || accentColor,
              }}
              className="inline-flex w-fit rounded-full px-2 py-0.5 text-[7px] font-semibold text-white"
            >
              Open →
            </span>
          </div>

          {activeMobileImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={activeMobileImage}
              alt={`Mobile preview of ${displayUrl}`}
              onError={() => markFailed(activeMobileImage)}
              className="absolute inset-0 z-10 size-full object-cover object-top"
            />
          )}
        </div>

        {/* Bottom Home Indicator Bar */}
        <div
          className={cn(
            "flex h-3 shrink-0 items-center justify-center",
            isDarkChrome ? "bg-[#09090b]" : "bg-white"
          )}
        >
          <div
            className={cn(
              "h-1 w-10 rounded-full",
              isDarkChrome ? "bg-white/30" : "bg-black/25"
            )}
          />
        </div>
      </div>
    )}
    </>
  )
}

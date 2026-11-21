"use client"

import * as React from "react"
import {
  IconChevronLeft,
  IconChevronRight,
  IconHome,
  IconLock,
  IconRefresh,
  IconWorld,
} from "@tabler/icons-react"
import type { StudioState } from "@/lib/studio-types"
import { formatDisplayUrl, validatePublicUrl } from "@/lib/url-utils"
import { cn } from "@/lib/utils"

export function WebMockupCard({
  state,
  logicalWidth,
  logicalHeight,
  isFetching = false,
}: {
  state: StudioState
  logicalWidth: number
  logicalHeight: number
  isFetching?: boolean
}) {
  const [loadedSrc, setLoadedSrc] = React.useState<string | null>(null)
  const [failedUrls, setFailedUrls] = React.useState<string[]>([])
  const [iframeLoadedUrl, setIframeLoadedUrl] = React.useState<string | null>(null)
  const viewportRef = React.useRef<HTMLDivElement>(null)
  const [viewportSize, setViewportSize] = React.useState({ width: 440, height: 320 })
  const displayUrl = formatDisplayUrl(state.url)

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
  }, [])

  const liveIframeUrl = React.useMemo(() => {
    const check = validatePublicUrl(state.url)
    return check.ok ? check.url.toString() : null
  }, [state.url])

  const candidates = React.useMemo(
    () =>
      [
        state.customScreenshotUrl,
        state.metadata?.screenshotUrl,
        state.metadata?.ogImageUrl,
      ].filter((v): v is string => Boolean(v)),
    [
      state.customScreenshotUrl,
      state.metadata?.screenshotUrl,
      state.metadata?.ogImageUrl,
    ]
  )

  const activeImage = candidates.find((src) => !failedUrls.includes(src)) ?? ""
  const imageReady = Boolean(activeImage) && loadedSrc === activeImage
  const iframeReady = Boolean(liveIframeUrl) && iframeLoadedUrl === liveIframeUrl
  const showLoadingHint =
    isFetching || (Boolean(activeImage) && !imageReady && !iframeReady)

  const iframeScale = Math.max(0.15, viewportSize.width / 1280)
  const iframeHeight = Math.max(
    900,
    Math.round(viewportSize.height / iframeScale)
  )

  const markFailed = (src: string) => {
    setFailedUrls((prev) => (prev.includes(src) ? prev : [...prev, src]))
  }

  const minDim = Math.min(logicalWidth, logicalHeight)
  const scaleFactor = minDim / 500
  const userScale = state.frameScale / 100
  const isDarkChrome = state.chromeTheme === "dark"
  const isGlassChrome = state.chromeTheme === "glass"
  const isDefaultLerhem = displayUrl.toLowerCase().includes("lerhem.space")

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

    if (state.webLayout === "offset") {
      const leftPct = 11 + (1 - userScale) * 24
      const topPct = 26.5 + (1 - userScale) * 20
      return {
        ...base,
        position: "absolute",
        left: `${leftPct}%`,
        top: `${topPct}%`,
        width: `${100 - leftPct + 2}%`,
        height: `${100 - topPct + 2}%`,
        borderTopLeftRadius: `${Math.round(22 * scaleFactor)}px`,
      }
    }

    if (state.webLayout === "centered") {
      return {
        ...base,
        position: "absolute",
        left: "50%",
        top: "50%",
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
        left: "50%",
        bottom: 0,
        transform: `translateX(-50%) scale(${userScale})`,
        transformOrigin: "bottom center",
        width: "86%",
        height: "82%",
        borderTopLeftRadius: `${Math.round(18 * scaleFactor)}px`,
        borderTopRightRadius: `${Math.round(18 * scaleFactor)}px`,
      }
    }

    // floating
    return {
      ...base,
      position: "absolute",
      left: "50%",
      top: "50%",
      transform: `translate(-50%, -50%) scale(${userScale * 0.92})`,
      width: "80%",
      height: "70%",
      borderRadius: `${Math.round(20 * scaleFactor)}px`,
    }
  }, [
    state.webLayout,
    state.frameShadow,
    userScale,
    scaleFactor,
    shadowAlpha,
    shadowBlur,
    shadowY,
  ])

  const renderChrome = () => {
    if (state.browserChrome === "none") return null

    if (state.browserChrome === "chrome") {
      return (
        <div className="shrink-0 select-none">
          {/* Top dark window bar with curved active tab */}
          <div
            className={cn(
              "relative flex items-end px-4 pt-2",
              isDarkChrome
                ? "bg-[#0d0d10]"
                : isGlassChrome
                  ? "bg-zinc-900/75 backdrop-blur-md"
                  : "bg-[#121215]"
            )}
            style={{ height: `${Math.round(36 * scaleFactor)}px` }}
          >
            <div className="mb-2.5 flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-zinc-700" />
              <span className="size-2.5 rounded-full bg-zinc-700" />
              <span className="size-2.5 rounded-full bg-zinc-700" />
            </div>
            <div
              className={cn(
                "relative ml-4 flex h-[80%] min-w-[36%] max-w-[52%] items-center rounded-t-[10px] px-3.5",
                isDarkChrome
                  ? "bg-[#18181b] text-zinc-200"
                  : isGlassChrome
                    ? "bg-white/92 text-zinc-900"
                    : "bg-white text-zinc-900"
              )}
            >
              {state.metadata?.faviconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={state.metadata.faviconUrl}
                  alt=""
                  className="mr-1.5 size-3 rounded-xs object-contain"
                />
              ) : null}
              <span className="truncate text-[10px] font-medium opacity-75">
                {state.metadata?.siteName || (isDefaultLerhem ? "Lerhem" : displayUrl)}
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
            <div className="flex shrink-0 items-center gap-2">
              <IconChevronLeft className="size-4" stroke={1.8} />
              <IconChevronRight className="size-4 opacity-30" stroke={1.8} />
              <IconRefresh className="size-3.5" stroke={1.9} />
              <IconHome className="size-3.5" stroke={1.9} />
            </div>

            <div
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1",
                isDarkChrome ? "bg-zinc-800 text-zinc-100" : "bg-[#18181b] text-zinc-100"
              )}
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-white/12">
                <IconLock className="size-3 text-zinc-200" stroke={2} />
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

  return (
    <div
      style={frameBoxStyle}
      className={cn(
        "flex flex-col overflow-hidden ring-1 ring-black/15",
        isDarkChrome ? "bg-[#09090b] text-zinc-50" : "bg-white text-zinc-950"
      )}
    >
      {renderChrome()}

      {/* Viewport */}
      <div ref={viewportRef} className="relative flex-1 overflow-hidden">
        <div
          className={cn(
            "flex h-full flex-col justify-between p-5",
            isDarkChrome ? "bg-[#0b0b0e] text-zinc-50" : "bg-white text-zinc-950"
          )}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {state.metadata?.faviconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={state.metadata.faviconUrl}
                  alt=""
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
            key={liveIframeUrl}
            src={liveIframeUrl}
            title={`Live preview of ${displayUrl}`}
            sandbox="allow-scripts allow-same-origin"
            tabIndex={-1}
            onLoad={() => setIframeLoadedUrl(liveIframeUrl)}
            style={{
              width: "1280px",
              height: `${iframeHeight}px`,
              transform: `scale(${iframeScale})`,
              transformOrigin: "top left",
            }}
            className={cn(
              "pointer-events-none absolute top-0 left-0 z-[5] border-0 bg-white transition-opacity duration-300",
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
  )
}

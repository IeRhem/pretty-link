"use client"

import * as React from "react"
import { SocialMockupCard } from "@/components/studio/social-mockup-card"
import { PosterOverlays, WebMockupCard } from "@/components/studio/web-mockup-card"
import { resolveAspectDimensions } from "@/lib/presets"
import type { BackgroundPattern, StudioState } from "@/lib/studio-types"
import { cn } from "@/lib/utils"

function BackgroundPatternLayer({
  pattern,
  opacity,
  logicalWidth,
  logicalHeight,
}: {
  pattern: BackgroundPattern
  opacity: number
  logicalWidth: number
  logicalHeight: number
}) {
  const crossId = React.useId()
  if (!pattern || pattern === "none") return null

  const alpha = Math.max(0, Math.min(1, opacity / 100))

  if (pattern === "dots") {
    return (
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: alpha,
          backgroundImage:
            "radial-gradient(circle, #ffffff 1.35px, transparent 1.35px)",
          backgroundSize: "18px 18px",
        }}
      />
    )
  }

  if (pattern === "grid") {
    return (
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: alpha,
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.85) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.85) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
    )
  }

  if (pattern === "diagonal") {
    return (
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: alpha,
          backgroundImage:
            "repeating-linear-gradient(135deg, rgba(255,255,255,0.8) 0px, rgba(255,255,255,0.8) 1px, transparent 1px, transparent 16px)",
        }}
      />
    )
  }

  if (pattern === "diamond") {
    return (
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: alpha,
          backgroundImage:
            "repeating-linear-gradient(45deg, rgba(255,255,255,0.75) 0px, rgba(255,255,255,0.75) 1px, transparent 1px, transparent 20px), repeating-linear-gradient(-45deg, rgba(255,255,255,0.75) 0px, rgba(255,255,255,0.75) 1px, transparent 1px, transparent 20px)",
        }}
      />
    )
  }

  if (pattern === "spotlight") {
    return (
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: alpha,
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.85) 0%, transparent 55%), radial-gradient(circle at 82% 78%, rgba(255,255,255,0.65) 0%, transparent 58%)",
        }}
      />
    )
  }

  if (pattern === "cross") {
    return (
      <svg
        className="pointer-events-none absolute inset-0 size-full"
        style={{ opacity: alpha }}
        aria-hidden="true"
      >
        <defs>
          <pattern
            id={crossId}
            width="28"
            height="28"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 14 9 V 19 M 9 14 H 19"
              stroke="#ffffff"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${crossId})`} />
      </svg>
    )
  }

  // rings
  return (
    <svg
      viewBox={`0 0 ${logicalWidth} ${logicalHeight}`}
      className="pointer-events-none absolute inset-0 size-full"
      style={{ opacity: alpha }}
      aria-hidden="true"
    >
      {[55, 110, 165, 220, 275, 330, 385, 440].map((r) => (
        <circle
          key={r}
          cx={logicalWidth / 2}
          cy={logicalHeight / 2}
          r={r}
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.25"
        />
      ))}
    </svg>
  )
}

export function MockupFrame({
  state,
  isFetching = false,
  previewGeneration = 0,
  zoomMultiplier = 1,
  maxWidthPx = 560,
  maxHeightPx = 560,
  className,
}: {
  state: StudioState
  isFetching?: boolean
  previewGeneration?: number
  zoomMultiplier?: number
  maxWidthPx?: number
  maxHeightPx?: number
  className?: string
}) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [bounds, setBounds] = React.useState({
    width: maxWidthPx,
    height: maxHeightPx,
  })

  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setBounds({ width: rect.width, height: rect.height })
      }
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { width: rawW, height: rawH } = resolveAspectDimensions(state)
  const normScale = 500 / Math.min(rawW, rawH)
  const logicalW = Math.round(rawW * normScale)
  const logicalH = Math.round(rawH * normScale)

  const availW = Math.min(bounds.width, maxWidthPx)
  const availH = Math.min(bounds.height, maxHeightPx)
  const fitScale = Math.min(availW / logicalW, availH / logicalH)
  const displayScale = Math.max(0.15, fitScale * zoomMultiplier)

  const scaledW = Math.round(logicalW * displayScale)
  const scaledH = Math.round(logicalH * displayScale)

  const minDim = Math.min(logicalW, logicalH)
  const outerRadius =
    state.borderStyle === "sharp"
      ? 0
      : state.borderStyle === "curved"
        ? Math.round(minDim * 0.036)
        : Math.round(minDim * 0.064)

  const backgroundStyle = React.useMemo((): React.CSSProperties => {
    if (state.backgroundType === "none") {
      return {}
    }
    if (state.backgroundType === "color") {
      if (state.colorFillMode === "solid") {
        return { backgroundColor: state.solidColor }
      }
      const stops = state.gradientVia
        ? `${state.gradientFrom} 0%, ${state.gradientVia} 50%, ${state.gradientTo} 100%`
        : `${state.gradientFrom} 0%, ${state.gradientTo} 100%`
      return {
        backgroundImage: `linear-gradient(${state.gradientAngle}deg, ${stops})`,
      }
    }
    return { backgroundColor: "#18181b" }
  }, [
    state.backgroundType,
    state.colorFillMode,
    state.solidColor,
    state.gradientAngle,
    state.gradientFrom,
    state.gradientVia,
    state.gradientTo,
  ])

  return (
    <div
      ref={containerRef}
      className={cn("flex size-full max-h-full max-w-full items-center justify-center", className)}
    >
      <div
        style={{ width: `${scaledW}px`, height: `${scaledH}px` }}
        className="relative shrink-0 transition-[width,height] duration-200"
      >
        <div
          style={{
            width: `${logicalW}px`,
            height: `${logicalH}px`,
            transform: `scale(${displayScale})`,
            transformOrigin: "top left",
            borderRadius: `${outerRadius}px`,
            ...backgroundStyle,
          }}
          className={cn(
            "relative overflow-hidden shadow-2xl ring-1 ring-white/10 transition-[border-radius] duration-150",
            state.backgroundType === "none" && "bg-checkerboard"
          )}
        >
          {/* Image / Unsplash Background Layer */}
          {(state.backgroundType === "image" ||
            state.backgroundType === "unsplash") &&
            state.backgroundImageUrl && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={state.backgroundImageUrl}
                  alt="Canvas background"
                  style={{
                    filter:
                      state.bgBlur > 0
                        ? `blur(${state.bgBlur}px) scale(1.06)`
                        : undefined,
                  }}
                  className="pointer-events-none absolute inset-0 size-full object-cover"
                />
                {state.bgDim > 0 && (
                  <div
                    style={{
                      backgroundColor: `rgba(0, 0, 0, ${Math.min(0.85, state.bgDim / 100)})`,
                    }}
                    className="pointer-events-none absolute inset-0"
                  />
                )}
              </>
            )}

          {/* Optional subtle SVG noise layer */}
          {state.backgroundType === "color" && state.noiseOverlay && (
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.09] mix-blend-overlay"
              style={{
                backgroundImage:
                  "radial-gradient(rgba(255,255,255,0.9) 0.75px, transparent 0.75px)",
                backgroundSize: "4px 4px",
              }}
            />
          )}

          {/* Procedural background pattern layer */}
          {state.backgroundType !== "none" && (
            <BackgroundPatternLayer
              pattern={state.bgPattern}
              opacity={state.bgPatternOpacity ?? 22}
              logicalWidth={logicalW}
              logicalHeight={logicalH}
            />
          )}

          {/* Poster & branding overlay layer */}
          <PosterOverlays
            state={state}
            logicalWidth={logicalW}
            logicalHeight={logicalH}
            previewGeneration={previewGeneration}
          />

          {/* Content layer */}
          {state.mode === "web" ? (
            <WebMockupCard
              state={state}
              logicalWidth={logicalW}
              logicalHeight={logicalH}
              isFetching={isFetching}
              previewGeneration={previewGeneration}
            />
          ) : (
            <SocialMockupCard
              state={state}
              logicalWidth={logicalW}
              logicalHeight={logicalH}
              previewGeneration={previewGeneration}
            />
          )}
        </div>
      </div>
    </div>
  )
}

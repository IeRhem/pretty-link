"use client"

import * as React from "react"
import { SocialMockupCard } from "@/components/studio/social-mockup-card"
import { WebMockupCard } from "@/components/studio/web-mockup-card"
import { resolveAspectDimensions } from "@/lib/presets"
import type { StudioState } from "@/lib/studio-types"
import { cn } from "@/lib/utils"

export function MockupFrame({
  state,
  isFetching = false,
  zoomMultiplier = 1,
  maxWidthPx = 560,
  maxHeightPx = 560,
  className,
}: {
  state: StudioState
  isFetching?: boolean
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

  const { width: logicalW, height: logicalH } = resolveAspectDimensions(state)

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
      className={cn("flex size-full items-center justify-center", className)}
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

          {/* Content layer */}
          {state.mode === "web" ? (
            <WebMockupCard
              state={state}
              logicalWidth={logicalW}
              logicalHeight={logicalH}
              isFetching={isFetching}
            />
          ) : (
            <SocialMockupCard
              state={state}
              logicalWidth={logicalW}
              logicalHeight={logicalH}
            />
          )}
        </div>
      </div>
    </div>
  )
}

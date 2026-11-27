"use client"

import * as React from "react"
import { CodeMockupCard } from "@/components/studio/code-mockup-card"
import { SocialMockupCard } from "@/components/studio/social-mockup-card"
import { PosterOverlays, WebMockupCard } from "@/components/studio/web-mockup-card"
import {
  getFrameTiltCssTransform,
  resolveAspectDimensions,
  resolveUnsplashPhotoUrl,
} from "@/lib/presets"
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
  onChange,
  className,
}: {
  state: StudioState
  isFetching?: boolean
  previewGeneration?: number
  zoomMultiplier?: number
  maxWidthPx?: number
  maxHeightPx?: number
  onChange?: (
    patch: Partial<StudioState>,
    options?: { forceHistoryStep?: boolean; skipHistory?: boolean }
  ) => void
  className?: string
}) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [bounds, setBounds] = React.useState({
    width: maxWidthPx,
    height: maxHeightPx,
  })
  const [dragVisual, setDragVisual] = React.useState<{
    active: boolean
    kind: "frame" | "spotlight"
    snapX: boolean
    snapY: boolean
  }>({ active: false, kind: "frame", snapX: false, snapY: false })
  const dragSessionRef = React.useRef<{
    pointerId: number
    kind: "frame" | "spotlight"
    startX: number
    startY: number
    initialX: number
    initialY: number
    committedFirstStep: boolean
    previewGeneration: number
  } | null>(null)

  React.useEffect(() => {
    dragSessionRef.current = null
    const rafId = requestAnimationFrame(() => {
      setDragVisual((prev) =>
        prev.active ? { ...prev, active: false } : prev
      )
    })
    return () => cancelAnimationFrame(rafId)
  }, [previewGeneration])

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
            (() => {
              const resolvedBgImage =
                state.backgroundImageUrl ||
                (state.backgroundType === "unsplash"
                  ? resolveUnsplashPhotoUrl(state.unsplashPhotoId)
                  : "")
              if (!resolvedBgImage) return null
              return (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolvedBgImage}
                    alt="Canvas background"
                    style={{
                      filter:
                        state.bgBlur > 0
                          ? `blur(${state.bgBlur}px)`
                          : undefined,
                      transform: state.bgBlur > 0 ? "scale(1.06)" : undefined,
                    }}
                    className="pointer-events-none absolute inset-0 size-full object-cover"
                  />
                </>
              )
            })()}

          {/* Dim overlay for color, image, and unsplash backgrounds */}
          {state.backgroundType !== "none" && state.bgDim > 0 && (
            <div
              style={{
                backgroundColor: `rgba(0, 0, 0, ${Math.min(0.85, state.bgDim / 100)})`,
              }}
              className="pointer-events-none absolute inset-0"
            />
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

          {/* Interactive Draggable & 3D-Tilted Content Layer */}
          <div
            onPointerDown={(e) => {
              if (!onChange || e.button !== 0 || dragSessionRef.current !== null)
                return
              e.currentTarget.setPointerCapture(e.pointerId)
              dragSessionRef.current = {
                pointerId: e.pointerId,
                kind: "frame",
                startX: e.clientX,
                startY: e.clientY,
                initialX: state.frameOffsetX ?? 0,
                initialY: state.frameOffsetY ?? 0,
                committedFirstStep: false,
                previewGeneration,
              }
              setDragVisual({
                active: true,
                kind: "frame",
                snapX: (state.frameOffsetX ?? 0) === 0,
                snapY: (state.frameOffsetY ?? 0) === 0,
              })
            }}
            onPointerMove={(e) => {
              const session = dragSessionRef.current
              if (
                !onChange ||
                !session ||
                session.pointerId !== e.pointerId ||
                session.kind !== "frame"
              ) {
                return
              }
              if (session.previewGeneration !== previewGeneration) {
                dragSessionRef.current = null
                setDragVisual((prev) =>
                  prev.active ? { ...prev, active: false } : prev
                )
                return
              }
              const dx = e.clientX - session.startX
              const dy = e.clientY - session.startY
              if (
                !session.committedFirstStep &&
                Math.hypot(dx, dy) < 2
              ) {
                return
              }
              const rawX = Math.max(
                -35,
                Math.min(
                  35,
                  Math.round(session.initialX + (dx / Math.max(1, scaledW)) * 100)
                )
              )
              const rawY = Math.max(
                -35,
                Math.min(
                  35,
                  Math.round(session.initialY + (dy / Math.max(1, scaledH)) * 100)
                )
              )
              const snapX = Math.abs(rawX) <= 2
              const snapY = Math.abs(rawY) <= 2
              const nextX = snapX ? 0 : rawX
              const nextY = snapY ? 0 : rawY
              setDragVisual({
                active: true,
                kind: "frame",
                snapX,
                snapY,
              })
              if (!session.committedFirstStep) {
                session.committedFirstStep = true
                onChange(
                  { frameOffsetX: nextX, frameOffsetY: nextY },
                  { forceHistoryStep: true }
                )
              } else {
                onChange(
                  { frameOffsetX: nextX, frameOffsetY: nextY },
                  { skipHistory: true }
                )
              }
            }}
            onPointerUp={(e) => {
              if (dragSessionRef.current?.pointerId === e.pointerId) {
                dragSessionRef.current = null
                setDragVisual((prev) =>
                  prev.active ? { ...prev, active: false } : prev
                )
              }
            }}
            onPointerCancel={(e) => {
              if (dragSessionRef.current?.pointerId === e.pointerId) {
                dragSessionRef.current = null
                setDragVisual((prev) =>
                  prev.active ? { ...prev, active: false } : prev
                )
              }
            }}
            onLostPointerCapture={(e) => {
              if (dragSessionRef.current?.pointerId === e.pointerId) {
                dragSessionRef.current = null
                setDragVisual((prev) =>
                  prev.active ? { ...prev, active: false } : prev
                )
              }
            }}
            onDoubleClick={() => {
              if (!onChange) return
              if (
                (state.frameOffsetX ?? 0) !== 0 ||
                (state.frameOffsetY ?? 0) !== 0
              ) {
                onChange(
                  { frameOffsetX: 0, frameOffsetY: 0 },
                  { forceHistoryStep: true }
                )
              }
            }}
            style={{
              transform: getFrameTiltCssTransform(state.frameTilt),
              transformOrigin: "center center",
            }}
            className={cn(
              "relative size-full",
              onChange && "cursor-grab active:cursor-grabbing"
            )}
          >
            {state.mode === "web" ? (
              <WebMockupCard
                state={state}
                logicalWidth={logicalW}
                logicalHeight={logicalH}
                isFetching={isFetching}
                previewGeneration={previewGeneration}
              />
            ) : state.mode === "social" ? (
              <SocialMockupCard
                state={state}
                logicalWidth={logicalW}
                logicalHeight={logicalH}
                previewGeneration={previewGeneration}
              />
            ) : (
              <CodeMockupCard
                state={state}
                logicalWidth={logicalW}
                logicalHeight={logicalH}
              />
            )}
          </div>

          {/* Spotlight Focus Overlay */}
          {state.showSpotlight && (
            <div
              style={{
                background: `radial-gradient(circle ${Math.round(((state.spotlightRadius ?? 28) / 100) * minDim)}px at ${state.spotlightX ?? 50}% ${state.spotlightY ?? 50}%, rgba(0,0,0,0) 78%, rgba(0,0,0,${Math.min(0.88, (state.spotlightDim ?? 55) / 100)}) 100%)`,
              }}
              className="pointer-events-none absolute inset-0 z-25"
            >
              <div
                onPointerDown={(e) => {
                  if (
                    !onChange ||
                    e.button !== 0 ||
                    dragSessionRef.current !== null
                  )
                    return
                  e.stopPropagation()
                  e.currentTarget.setPointerCapture(e.pointerId)
                  dragSessionRef.current = {
                    pointerId: e.pointerId,
                    kind: "spotlight",
                    startX: e.clientX,
                    startY: e.clientY,
                    initialX: state.spotlightX ?? 50,
                    initialY: state.spotlightY ?? 50,
                    committedFirstStep: false,
                    previewGeneration,
                  }
                  setDragVisual({
                    active: true,
                    kind: "spotlight",
                    snapX: false,
                    snapY: false,
                  })
                }}
                onPointerMove={(e) => {
                  const session = dragSessionRef.current
                  if (
                    !onChange ||
                    !session ||
                    session.pointerId !== e.pointerId ||
                    session.kind !== "spotlight"
                  ) {
                    return
                  }
                  if (session.previewGeneration !== previewGeneration) {
                    dragSessionRef.current = null
                    setDragVisual((prev) =>
                      prev.active ? { ...prev, active: false } : prev
                    )
                    return
                  }
                  e.stopPropagation()
                  const dx = e.clientX - session.startX
                  const dy = e.clientY - session.startY
                  const nextX = Math.max(
                    10,
                    Math.min(
                      90,
                      Math.round(
                        session.initialX + (dx / Math.max(1, scaledW)) * 100
                      )
                    )
                  )
                  const nextY = Math.max(
                    10,
                    Math.min(
                      90,
                      Math.round(
                        session.initialY + (dy / Math.max(1, scaledH)) * 100
                      )
                    )
                  )
                  if (!session.committedFirstStep) {
                    session.committedFirstStep = true
                    onChange(
                      { spotlightX: nextX, spotlightY: nextY },
                      { forceHistoryStep: true }
                    )
                  } else {
                    onChange(
                      { spotlightX: nextX, spotlightY: nextY },
                      { skipHistory: true }
                    )
                  }
                }}
                onPointerUp={(e) => {
                  if (dragSessionRef.current?.pointerId === e.pointerId) {
                    e.stopPropagation()
                    dragSessionRef.current = null
                    setDragVisual((prev) =>
                      prev.active ? { ...prev, active: false } : prev
                    )
                  }
                }}
                onPointerCancel={(e) => {
                  if (dragSessionRef.current?.pointerId === e.pointerId) {
                    e.stopPropagation()
                    dragSessionRef.current = null
                    setDragVisual((prev) =>
                      prev.active ? { ...prev, active: false } : prev
                    )
                  }
                }}
                onLostPointerCapture={(e) => {
                  if (dragSessionRef.current?.pointerId === e.pointerId) {
                    dragSessionRef.current = null
                    setDragVisual((prev) =>
                      prev.active ? { ...prev, active: false } : prev
                    )
                  }
                }}
                style={{
                  left: `${state.spotlightX ?? 50}%`,
                  top: `${state.spotlightY ?? 50}%`,
                  width: `${Math.round(((state.spotlightRadius ?? 28) / 100) * minDim * 1.72)}px`,
                  height: `${Math.round(((state.spotlightRadius ?? 28) / 100) * minDim * 1.72)}px`,
                  transform: "translate(-50%, -50%)",
                }}
                className={cn(
                  " absolute rounded-full border border-white/40 shadow-[0_0_24px_rgba(255,255,255,0.18)]",
                  onChange &&
                    "pointer-events-auto cursor-move hover:border-white/70"
                )}
              />
            </div>
          )}

          {/* Magnetic Center Snap Hairline Guides */}
          {dragVisual.active && dragVisual.kind === "frame" && (
            <div className="pointer-events-none absolute inset-0 z-30">
              {dragVisual.snapX && (
                <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 border-l border-dashed border-cyan-300/90 shadow-[0_0_6px_rgba(103,232,249,0.8)]" />
              )}
              {dragVisual.snapY && (
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-cyan-300/90 shadow-[0_0_6px_rgba(103,232,249,0.8)]" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

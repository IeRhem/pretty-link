"use client"

import * as React from "react"
import {
  IconCheck,
  IconDice5,
  IconLink,
  IconMoon,
  IconRestore,
  IconShare2,
  IconSun,
  IconZoomIn,
  IconZoomOut,
} from "@tabler/icons-react"
import { MockupFrame } from "@/components/studio/mockup-frame"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { QUICK_TEMPLATES, resolveAspectDimensions } from "@/lib/presets"
import type { StudioState } from "@/lib/studio-types"
import { formatDisplayUrl } from "@/lib/url-utils"
import { cn } from "@/lib/utils"

export function PreviewStage({
  state,
  isFetching,
  onToggleTheme,
  onRandomize,
  onReset,
  onShareLink,
  onApplyTemplate,
  onDropImage,
}: {
  state: StudioState
  isFetching: boolean
  onToggleTheme: () => void
  onRandomize: () => void
  onReset: () => void
  onShareLink: () => void
  onApplyTemplate: (patch: Partial<StudioState>) => void
  onDropImage: (dataUrl: string) => void
}) {
  const [zoom, setZoom] = React.useState(1)
  const [dragging, setDragging] = React.useState(false)
  const [sharedCopied, setSharedCopied] = React.useState(false)
  const { width, height } = resolveAspectDimensions(state)

  const handleShareClick = () => {
    onShareLink()
    setSharedCopied(true)
    setTimeout(() => setSharedCopied(false), 1800)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file || !file.type.startsWith("image/")) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onDropImage(reader.result)
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className="bg-studio-grid relative flex min-h-[520px] flex-1 flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-background/40 p-3 sm:p-5"
    >
      {/* Drop target overlay */}
      {dragging && (
        <div className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-background/80 backdrop-blur-xs">
          <div className="rounded-xl bg-card px-5 py-3 text-sm font-semibold shadow-lg ring-1 ring-border">
            Drop image to set as canvas background
          </div>
        </div>
      )}

      {/* Top Studio Header Bar */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-card/90 px-3 py-1.5 shadow-2xs backdrop-blur-md">
            <span className="flex size-6 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-2xs">
              <IconLink className="size-3.5" stroke={2.2} />
            </span>
            <span className="font-heading text-sm font-semibold tracking-tight">
              PrettyLink
            </span>
          </div>

          <Badge
            variant="outline"
            className="hidden bg-card/80 font-mono text-[11px] text-muted-foreground sm:inline-flex"
          >
            {formatDisplayUrl(state.url)} · {width}×{height}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-card/90 p-1 shadow-2xs backdrop-blur-md">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onRandomize}
                  className="h-8 gap-1.5 px-2.5 text-xs"
                />
              }
            >
              <IconDice5 className="size-4" />
              <span className="hidden sm:inline">Randomize</span>
            </TooltipTrigger>
            <TooltipContent>Randomize gradient & frame style</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={onReset}
                  aria-label="Reset studio"
                />
              }
            >
              <IconRestore className="size-4" />
            </TooltipTrigger>
            <TooltipContent>Reset to default preset</TooltipContent>
          </Tooltip>

          <div className="mx-0.5 hidden h-4 w-px bg-border sm:block" />

          <div className="hidden items-center gap-0.5 sm:flex">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setZoom((z) => Math.max(0.65, Number((z - 0.1).toFixed(2))))}
              aria-label="Zoom out"
            >
              <IconZoomOut className="size-4" />
            </Button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="min-w-10 text-center font-mono text-[11px] text-muted-foreground hover:text-foreground"
              title="Reset zoom to 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setZoom((z) => Math.min(1.25, Number((z + 0.1).toFixed(2))))}
              aria-label="Zoom in"
            >
              <IconZoomIn className="size-4" />
            </Button>
          </div>

          <div className="mx-0.5 h-4 w-px bg-border" />

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleShareClick}
                  className="h-8 gap-1.5 px-2.5 text-xs"
                />
              }
            >
              {sharedCopied ? (
                <IconCheck className="size-4 text-primary" />
              ) : (
                <IconShare2 className="size-4" />
              )}
              <span className="hidden sm:inline">
                {sharedCopied ? "Copied" : "Share"}
              </span>
            </TooltipTrigger>
            <TooltipContent>Copy interactive shareable link page</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={onToggleTheme}
                  aria-label="Toggle studio theme"
                />
              }
            >
              <IconSun className="hidden size-4 dark:block" />
              <IconMoon className="block size-4 dark:hidden" />
            </TooltipTrigger>
            <TooltipContent>
              Toggle light / dark theme
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      {/* Center Stage Artwork */}
      <div className="relative my-3 flex min-h-0 flex-1 items-center justify-center p-2 sm:p-6">
        <MockupFrame
          state={state}
          isFetching={isFetching}
          zoomMultiplier={zoom}
          maxWidthPx={580}
          maxHeightPx={540}
        />
      </div>

      {/* Bottom Quick-Template Strip */}
      <footer className="flex flex-wrap items-center justify-center gap-1.5">
        <div className="flex max-w-full items-center gap-1.5 overflow-x-auto rounded-2xl border border-border/80 bg-card/90 p-1.5 shadow-2xs backdrop-blur-md">
          <span className="px-2 text-[11px] font-medium whitespace-nowrap text-muted-foreground">
            Presets
          </span>
          {QUICK_TEMPLATES.map((tpl) => {
            const isActive =
              state.mode === tpl.mode &&
              state.url === tpl.patch.url &&
              state.aspectRatioId === tpl.patch.aspectRatioId
            return (
              <button
                key={tpl.id}
                type="button"
                onClick={() => onApplyTemplate(tpl.patch)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                  isActive
                    ? "bg-muted text-foreground ring-1 ring-border"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                <span
                  style={{ backgroundImage: tpl.swatch }}
                  className="size-3 rounded-full ring-1 ring-white/20"
                />
                <span>{tpl.name}</span>
              </button>
            )
          })}
        </div>
      </footer>
    </section>
  )
}

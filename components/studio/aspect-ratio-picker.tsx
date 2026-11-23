"use client"

import * as React from "react"
import { IconCheck, IconChevronRight } from "@tabler/icons-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ASPECT_RATIOS, resolveAspectDimensions } from "@/lib/presets"
import type { AspectRatioPreset, StudioState } from "@/lib/studio-types"
import { cn } from "@/lib/utils"

function MiniRatioThumb({
  width,
  height,
  active,
}: {
  width: number
  height: number
  active?: boolean
}) {
  const ratio = width / Math.max(1, height)
  let boxW = 22
  let boxH = 22
  if (ratio > 1) {
    boxW = 24
    boxH = Math.max(12, Math.round(24 / ratio))
  } else if (ratio < 1) {
    boxH = 24
    boxW = Math.max(12, Math.round(24 * ratio))
  }
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/60">
      <div
        style={{ width: `${boxW}px`, height: `${boxH}px` }}
        className={cn(
          "rounded-[4px] border transition-colors",
          active
            ? "border-primary bg-primary/25"
            : "border-foreground/30 bg-foreground/15"
        )}
      />
    </div>
  )
}

export function AspectRatioPicker({
  state,
  onChange,
}: {
  state: StudioState
  onChange: (patch: Partial<StudioState>) => void
}) {
  const [open, setOpen] = React.useState(false)
  const { preset, width, height } = resolveAspectDimensions(state)

  const groups: Array<{
    title: string
    items: AspectRatioPreset[]
  }> = [
    {
      title: "Square",
      items: ASPECT_RATIOS.filter((r) => r.category === "square"),
    },
    {
      title: "Landscape & OG",
      items: ASPECT_RATIOS.filter((r) => r.category === "landscape"),
    },
    {
      title: "Portrait & Stories",
      items: ASPECT_RATIOS.filter((r) => r.category === "portrait"),
    },
  ]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Choose aspect ratio"
        className="group flex w-full items-center gap-3 rounded-xl border border-border/80 bg-background/50 p-2 text-left transition-colors hover:border-ring/50 hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <MiniRatioThumb width={width} height={height} active />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm leading-tight font-medium text-foreground">
            {preset.label}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {width} × {height}
          </div>
        </div>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/80 text-muted-foreground transition-colors group-hover:bg-muted group-hover:text-foreground">
          <IconChevronRight className="size-4" />
        </span>
      </PopoverTrigger>

      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={8}
        className="w-[min(20rem,calc(100dvw-2rem))] p-3"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="font-heading text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Canvas Aspect Ratio
            </span>
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {width}×{height}
            </span>
          </div>

          <div className="max-h-72 space-y-3 overflow-y-auto pr-0.5">
            {groups.map((group) => (
              <div key={group.title} className="space-y-1">
                <div className="px-1 text-[10px] font-semibold tracking-wider text-muted-foreground/80 uppercase">
                  {group.title}
                </div>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const isSelected = state.aspectRatioId === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          onChange({
                            aspectRatioId: item.id,
                            customWidth: item.width,
                            customHeight: item.height,
                          })
                          setOpen(false)
                        }}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                          isSelected
                            ? "bg-primary/15 text-foreground ring-1 ring-primary/40"
                            : "hover:bg-muted/60"
                        )}
                      >
                        <MiniRatioThumb
                          width={item.width}
                          height={item.height}
                          active={isSelected}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium">
                            {item.label}
                          </div>
                          <div className="text-[11px] text-muted-foreground tabular-nums">
                            {item.width} × {item.height} · {item.ratioLabel}
                          </div>
                        </div>
                        {isSelected && (
                          <IconCheck className="size-4 shrink-0 text-primary" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Custom W x H */}
            <div className="space-y-2 rounded-lg border border-border/70 bg-muted/30 p-2.5">
              <button
                type="button"
                onClick={() => onChange({ aspectRatioId: "custom" })}
                className="flex w-full items-center justify-between text-xs font-medium"
              >
                <span>Custom Dimensions</span>
                {state.aspectRatioId === "custom" && (
                  <IconCheck className="size-3.5 text-primary" />
                )}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Width
                  </Label>
                  <Input
                    type="number"
                    min={240}
                    max={2400}
                    value={state.customWidth}
                    onChange={(e) =>
                      onChange({
                        aspectRatioId: "custom",
                        customWidth: Number(e.target.value) || 500,
                      })
                    }
                    className="h-7 text-xs tabular-nums"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Height
                  </Label>
                  <Input
                    type="number"
                    min={240}
                    max={2400}
                    value={state.customHeight}
                    onChange={(e) =>
                      onChange({
                        aspectRatioId: "custom",
                        customHeight: Number(e.target.value) || 500,
                      })
                    }
                    className="h-7 text-xs tabular-nums"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

"use client"

import * as React from "react"
import {
  IconBan,
  IconBrandUnsplash,
  IconPalette,
  IconPhotoPlus,
  IconSearch,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  CURATED_UNSPLASH_PHOTOS,
  GRADIENT_PRESETS,
  SOLID_PRESETS,
  UNSPLASH_CATEGORIES,
} from "@/lib/presets"
import type {
  BackgroundType,
  StudioState,
  UnsplashPhoto,
} from "@/lib/studio-types"
import { cn } from "@/lib/utils"

const BG_OPTIONS: Array<{
  id: BackgroundType
  label: string
  icon: React.ComponentType<{ className?: string; stroke?: number }>
}> = [
  { id: "none", label: "None", icon: IconBan },
  { id: "color", label: "Color", icon: IconPalette },
  { id: "image", label: "Image", icon: IconPhotoPlus },
  { id: "unsplash", label: "Unsplash", icon: IconBrandUnsplash },
]

export function BackgroundControls({
  state,
  onChange,
}: {
  state: StudioState
  onChange: (patch: Partial<StudioState>) => void
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [unsplashQuery, setUnsplashQuery] = React.useState("")
  const [unsplashCategory, setUnsplashCategory] =
    React.useState<(typeof UNSPLASH_CATEGORIES)[number]>("All")
  const [photos, setPhotos] = React.useState<UnsplashPhoto[]>(
    CURATED_UNSPLASH_PHOTOS
  )
  const [loadingPhotos, setLoadingPhotos] = React.useState(false)

  React.useEffect(() => {
    if (state.backgroundType !== "unsplash") return
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoadingPhotos(true)
      try {
        const res = await fetch(
          `/api/unsplash?q=${encodeURIComponent(unsplashQuery)}&category=${encodeURIComponent(unsplashCategory)}`
        )
        if (!res.ok) return
        const data = (await res.json()) as { photos?: UnsplashPhoto[] }
        if (!cancelled && Array.isArray(data.photos)) {
          setPhotos(data.photos)
        }
      } catch {
        // Keep existing curated fallback
      } finally {
        if (!cancelled) setLoadingPhotos(false)
      }
    }, 200)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [state.backgroundType, unsplashQuery, unsplashCategory])

  const handleFileUpload = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        onChange({
          backgroundType: "image",
          backgroundImageUrl: reader.result,
          unsplashPhotoId: "",
          unsplashPhotographer: "",
        })
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-2.5">
      <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        Background
      </div>

      {/* 4-way segmented selector matching uploaded mockup */}
      <div className="grid grid-cols-4 gap-1 rounded-xl border border-border/80 bg-background/50 p-1">
        {BG_OPTIONS.map((opt) => {
          const Icon = opt.icon
          const active = state.backgroundType === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange({ backgroundType: opt.id })}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-lg py-2 text-[11px] font-medium transition-all",
                active
                  ? "bg-card text-foreground shadow-xs ring-1 ring-border"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              )}
            >
              <Icon className="size-4" stroke={1.75} />
              <span>{opt.label}</span>
            </button>
          )
        })}
      </div>

      {/* Contextual sub-controls */}
      {state.backgroundType === "none" && (
        <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
          Transparent canvas background — ideal for PNG exports dropped into decks or hero layouts.
        </div>
      )}

      {state.backgroundType === "color" && (
        <div className="space-y-3 rounded-xl border border-border/70 bg-background/40 p-3">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/60 p-0.5">
            {(["gradient", "solid"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onChange({ colorFillMode: mode })}
                className={cn(
                  "rounded-md py-1 text-xs font-medium capitalize transition-colors",
                  state.colorFillMode === mode
                    ? "bg-card text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {mode}
              </button>
            ))}
          </div>

          {state.colorFillMode === "gradient" ? (
            <>
              <div className="grid grid-cols-8 gap-1.5">
                {GRADIENT_PRESETS.map((g) => {
                  const active = state.gradientId === g.id
                  const bg = g.via
                    ? `linear-gradient(${g.angle}deg, ${g.from}, ${g.via}, ${g.to})`
                    : `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})`
                  return (
                    <button
                      key={g.id}
                      type="button"
                      title={g.name}
                      aria-label={g.name}
                      onClick={() =>
                        onChange({
                          gradientId: g.id,
                          gradientFrom: g.from,
                          gradientVia: g.via ?? "",
                          gradientTo: g.to,
                          gradientAngle: g.angle,
                        })
                      }
                      style={{ backgroundImage: bg }}
                      className={cn(
                        "size-6 rounded-full transition-transform hover:scale-110",
                        active
                          ? "ring-2 ring-primary ring-offset-2 ring-offset-card"
                          : "ring-1 ring-white/15"
                      )}
                    />
                  )
                })}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <label className="flex items-center justify-between rounded-lg border border-border/70 bg-card/70 px-2 py-1 text-[11px]">
                  <span className="text-muted-foreground">Start</span>
                  <input
                    type="color"
                    value={state.gradientFrom}
                    onChange={(e) =>
                      onChange({
                        gradientId: "custom",
                        gradientFrom: e.target.value,
                        gradientVia: "",
                      })
                    }
                    className="h-4 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                </label>
                <label className="flex items-center justify-between rounded-lg border border-border/70 bg-card/70 px-2 py-1 text-[11px]">
                  <span className="text-muted-foreground">End</span>
                  <input
                    type="color"
                    value={state.gradientTo}
                    onChange={(e) =>
                      onChange({
                        gradientId: "custom",
                        gradientTo: e.target.value,
                        gradientVia: "",
                      })
                    }
                    className="h-4 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                </label>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Angle</span>
                  <span className="font-mono tabular-nums">{state.gradientAngle}°</span>
                </div>
                <Slider
                  min={0}
                  max={360}
                  step={5}
                  value={[state.gradientAngle]}
                  onValueChange={(v) =>
                    onChange({
                      gradientAngle: Array.isArray(v) ? (v[0] ?? 135) : v,
                    })
                  }
                />
              </div>
            </>
          ) : (
            <div className="space-y-2.5">
              <div className="grid grid-cols-6 gap-1.5">
                {SOLID_PRESETS.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    title={s.name}
                    aria-label={s.name}
                    onClick={() => onChange({ solidColor: s.color })}
                    style={{ backgroundColor: s.color }}
                    className={cn(
                      "h-6 w-full rounded-md transition-transform hover:scale-105",
                      state.solidColor.toLowerCase() === s.color.toLowerCase()
                        ? "ring-2 ring-primary ring-offset-2 ring-offset-card"
                        : "ring-1 ring-white/15"
                    )}
                  />
                ))}
              </div>
              <label className="flex items-center justify-between rounded-lg border border-border/70 bg-card/70 px-2.5 py-1.5 text-xs">
                <span className="text-muted-foreground">Custom Hex</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] uppercase text-muted-foreground">
                    {state.solidColor}
                  </span>
                  <input
                    type="color"
                    value={state.solidColor}
                    onChange={(e) => onChange({ solidColor: e.target.value })}
                    className="h-5 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
                  />
                </div>
              </label>
            </div>
          )}

          <div className="flex items-center justify-between pt-0.5">
            <Label className="text-xs text-muted-foreground">Subtle Grain</Label>
            <Switch
              checked={state.noiseOverlay}
              onCheckedChange={(checked) => onChange({ noiseOverlay: checked })}
            />
          </div>
        </div>
      )}

      {state.backgroundType === "image" && (
        <div className="space-y-3 rounded-xl border border-border/70 bg-background/40 p-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files?.[0])}
          />

          {state.backgroundImageUrl && !state.unsplashPhotoId ? (
            <div className="space-y-2">
              <div className="relative h-24 overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={state.backgroundImageUrl}
                  alt="Uploaded background"
                  className="size-full object-cover"
                />
                <div className="absolute inset-x-1.5 bottom-1.5 flex justify-end gap-1.5">
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Replace
                  </Button>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="destructive"
                    onClick={() => onChange({ backgroundImageUrl: "" })}
                  >
                    <IconTrash />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-muted/20 py-5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              <IconUpload className="size-5" />
              <span className="font-medium text-foreground">Upload wallpaper</span>
              <span className="text-[11px]">PNG, JPG, WebP or drag onto stage</span>
            </button>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Blur</span>
                <span className="font-mono">{state.bgBlur}px</span>
              </div>
              <Slider
                min={0}
                max={24}
                step={1}
                value={[state.bgBlur]}
                onValueChange={(v) =>
                  onChange({ bgBlur: Array.isArray(v) ? (v[0] ?? 0) : v })
                }
              />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Dim</span>
                <span className="font-mono">{state.bgDim}%</span>
              </div>
              <Slider
                min={0}
                max={75}
                step={5}
                value={[state.bgDim]}
                onValueChange={(v) =>
                  onChange({ bgDim: Array.isArray(v) ? (v[0] ?? 15) : v })
                }
              />
            </div>
          </div>
        </div>
      )}

      {state.backgroundType === "unsplash" && (
        <div className="space-y-2.5 rounded-xl border border-border/70 bg-background/40 p-3">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={unsplashQuery}
              onChange={(e) => setUnsplashQuery(e.target.value)}
              placeholder="Search textures, gradients, nature…"
              className="h-8 pl-8 text-xs"
            />
          </div>

          <div className="flex flex-wrap gap-1">
            {UNSPLASH_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setUnsplashCategory(cat)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
                  unsplashCategory === cat
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          {loadingPhotos ? (
            <div className="grid grid-cols-3 gap-1.5">
              {Array.from({ length: 6 }).map((_, idx) => (
                <Skeleton key={idx} className="aspect-square rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid max-h-40 grid-cols-3 gap-1.5 overflow-y-auto pr-0.5">
              {photos.map((photo) => {
                const active = state.unsplashPhotoId === photo.id
                return (
                  <button
                    key={photo.id}
                    type="button"
                    title={`${photo.alt} — ${photo.photographer}`}
                    onClick={() =>
                      onChange({
                        backgroundType: "unsplash",
                        backgroundImageUrl: photo.exportUrl ?? photo.fullUrl,
                        unsplashPhotoId: photo.id,
                        unsplashPhotographer: photo.photographer,
                      })
                    }
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-lg bg-muted transition-all",
                      active
                        ? "ring-2 ring-primary ring-offset-1 ring-offset-card"
                        : "hover:opacity-90"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.thumbUrl}
                      alt={photo.alt}
                      className="size-full object-cover"
                    />
                  </button>
                )
              })}
            </div>
          )}

          {state.unsplashPhotographer && (
            <p className="truncate text-[10px] text-muted-foreground">
              Photo by {state.unsplashPhotographer} on Unsplash
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 pt-0.5">
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Blur</span>
                <span className="font-mono">{state.bgBlur}px</span>
              </div>
              <Slider
                min={0}
                max={24}
                step={1}
                value={[state.bgBlur]}
                onValueChange={(v) =>
                  onChange({ bgBlur: Array.isArray(v) ? (v[0] ?? 0) : v })
                }
              />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Dim</span>
                <span className="font-mono">{state.bgDim}%</span>
              </div>
              <Slider
                min={0}
                max={75}
                step={5}
                value={[state.bgDim]}
                onValueChange={(v) =>
                  onChange({ bgDim: Array.isArray(v) ? (v[0] ?? 15) : v })
                }
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

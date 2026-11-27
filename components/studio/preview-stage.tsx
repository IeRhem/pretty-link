"use client"

import * as React from "react"
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconCheck,
  IconChevronDown,
  IconDice5,
  IconDownload,
  IconLayoutSidebarLeftExpand,
  IconLink,
  IconMoon,
  IconPlus,
  IconRestore,
  IconShare2,
  IconSparkles,
  IconSun,
  IconTrash,
  IconX,
  IconZoomIn,
  IconZoomOut,
} from "@tabler/icons-react"
import { MockupFrame } from "@/components/studio/mockup-frame"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroupLabel,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRadioItemIndicator,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  QUICK_TEMPLATES,
  resolveAspectDimensions,
  type CustomPreset,
} from "@/lib/presets"
import { DEFAULT_STUDIO_STATE, type StudioState } from "@/lib/studio-types"
import { formatDisplayUrl } from "@/lib/url-utils"

export function PreviewStage({
  state,
  isFetching,
  previewGeneration = 0,
  drawerId,
  mobileMenuOpen = false,
  onOpenMobileMenu,
  menuTriggerRef,
  onOpenExport,
  onToggleTheme,
  onRandomize,
  onReset,
  onShareLink,
  onApplyTemplate,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  customPresets = [],
  onApplyCustomPreset,
  onSaveCustomPreset,
  onDeleteCustomPreset,
  onDropImage,
  onChange,
  getUploadResetToken,
}: {
  state: StudioState
  isFetching: boolean
  previewGeneration?: number
  drawerId?: string
  mobileMenuOpen?: boolean
  onOpenMobileMenu?: () => void
  menuTriggerRef?: React.RefObject<HTMLButtonElement | null>
  onOpenExport?: () => void
  onToggleTheme: () => void
  onRandomize: () => void
  onReset: () => void
  onShareLink: () => void
  onApplyTemplate: (patch: Partial<StudioState>) => void
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
  customPresets?: CustomPreset[]
  onApplyCustomPreset?: (preset: CustomPreset) => void
  onSaveCustomPreset?: (name: string) => boolean | void
  onDeleteCustomPreset?: (id: string) => void
  onDropImage: (dataUrl: string) => void
  onChange?: (
    patch: Partial<StudioState>,
    options?: { forceHistoryStep?: boolean; skipHistory?: boolean }
  ) => void
  getUploadResetToken?: () => number
}) {
  const [zoom, setZoom] = React.useState(1)
  const [dragging, setDragging] = React.useState(false)
  const [sharedCopied, setSharedCopied] = React.useState(false)
  const [savingPreset, setSavingPreset] = React.useState(false)
  const [presetName, setPresetName] = React.useState("")
  const presetInputRef = React.useRef<HTMLInputElement>(null)
  const presetsTriggerRef = React.useRef<HTMLButtonElement>(null)
  const dropTokenRef = React.useRef(0)
  const { width, height } = resolveAspectDimensions(state)

  const backgroundSelectionKey = [
    state.backgroundType,
    state.colorFillMode,
    state.gradientId,
    state.gradientFrom,
    state.gradientVia,
    state.gradientTo,
    state.gradientAngle,
    state.solidColor,
    state.backgroundImageUrl,
    state.unsplashPhotoId,
    state.unsplashPhotographer,
    state.bgPattern,
    state.bgPatternOpacity,
    state.bgBlur,
    state.bgDim,
    state.noiseOverlay,
  ].join("|")

  React.useEffect(() => {
    dropTokenRef.current += 1
  }, [backgroundSelectionKey])

  React.useEffect(() => {
    if (savingPreset) {
      requestAnimationFrame(() => {
        presetInputRef.current?.focus()
      })
    }
  }, [savingPreset])

  const closeSavePresetForm = () => {
    setPresetName("")
    setSavingPreset(false)
    requestAnimationFrame(() => {
      presetsTriggerRef.current?.focus()
    })
  }

  const handleCommitSavePreset = (e?: React.FormEvent) => {
    e?.preventDefault()
    const trimmed = presetName.trim()
    if (!trimmed) return
    const saved = onSaveCustomPreset?.(trimmed)
    if (saved === false) return
    closeSavePresetForm()
  }

  const NON_STYLE_TEMPLATE_KEYS = React.useMemo(
    () =>
      new Set<keyof StudioState>([
        "url",
        "metadata",
        "tabTitle",
        "customScreenshotUrl",
        "customFaviconUrl",
        "socialDisplayName",
        "socialHandle",
        "socialBio",
        "socialMetrics",
        "socialCtaLabel",
        "socialAvatarUrl",
        "socialCoverUrl",
        "posterHeadline",
        "posterAccentText",
        "posterFooterTitle",
        "posterFooterSubtitle",
        "customMobileScreenshotUrl",
        "codeFilename",
        "codeContent",
        "changelogVersion",
        "changelogDate",
        "changelogTitle",
        "changelogItems",
      ]),
    []
  )

  const DEFAULTED_TEMPLATE_STYLE_KEYS = React.useMemo(
    () =>
      [
        "bgPattern",
        "bgPatternOpacity",
        "bgBlur",
        "bgDim",
        "noiseOverlay",
        "borderStyle",
        "frameScale",
        "frameOffsetX",
        "frameOffsetY",
        "frameShadow",
        "frameTilt",
        "showSpotlight",
        "showNavButtons",
        "webShowQr",
        "tabAccentColor",
        "showCornerIcon",
        "cornerIconPosition",
        "showPosterHeader",
        "posterHeadlineAlign",
        "posterHeadlineSize",
        "showPosterFooter",
        "fontStyle",
        "showCalloutBadge",
        "calloutPosition",
      ] as const,
    []
  )

  const doesPatchMatchState = (
    patch: Partial<StudioState>,
    options?: { isQuickTemplate?: boolean }
  ) => {
    const matchesPatchKeys = (
      Object.keys(patch) as Array<keyof StudioState>
    ).every((key) => {
      if (NON_STYLE_TEMPLATE_KEYS.has(key)) return true
      if (key === "calloutText") {
        if (options?.isQuickTemplate) return true
        if (!state.showCalloutBadge && !patch.showCalloutBadge) return true
      }
      const expected = patch[key]
      if (expected === undefined) return true
      if (
        (key === "customWidth" || key === "customHeight") &&
        state.aspectRatioId !== "custom" &&
        patch.aspectRatioId !== "custom"
      ) {
        return true
      }
      return state[key] === expected
    })

    if (!matchesPatchKeys) return false

    if (options?.isQuickTemplate) {
      return DEFAULTED_TEMPLATE_STYLE_KEYS.every((key) => {
        const expected =
          patch[key] !== undefined ? patch[key] : DEFAULT_STUDIO_STATE[key]
        return state[key] === expected
      })
    }

    return true
  }

  const isCustomPresetActive = (preset: CustomPreset) =>
    state.mode === preset.mode && doesPatchMatchState(preset.patch)

  const isTemplateActive = (tpl: (typeof QUICK_TEMPLATES)[number]) =>
    state.mode === tpl.mode &&
    doesPatchMatchState(tpl.patch, { isQuickTemplate: true })

  const activeCustomPreset = customPresets.find(isCustomPresetActive) ?? null
  const activeTemplate = QUICK_TEMPLATES.find(isTemplateActive) ?? null
  const activePresetDisplay = activeCustomPreset ?? activeTemplate

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
    const dropToken = ++dropTokenRef.current
    const resetToken = getUploadResetToken?.() ?? 0
    const reader = new FileReader()
    reader.onload = () => {
      if (
        dropTokenRef.current !== dropToken ||
        (getUploadResetToken?.() ?? 0) !== resetToken
      ) {
        return
      }
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
      className="@container/stage bg-studio-grid relative flex min-h-[340px] flex-1 flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-background/40 p-2.5 sm:p-4 lg:p-5"
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
        <div className="flex min-w-0 items-center gap-2">
          {onOpenMobileMenu && (
            <Button
              ref={menuTriggerRef}
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenMobileMenu}
              aria-label="Open studio controls sidebar"
              aria-expanded={mobileMenuOpen}
              aria-controls={drawerId}
              className="h-9 gap-1.5 rounded-xl border-border/80 bg-card/90 px-2.5 text-xs font-medium shadow-2xs backdrop-blur-md lg:hidden [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
            >
              <IconLayoutSidebarLeftExpand
                className="size-4 shrink-0"
                aria-hidden="true"
              />
              <span className="hidden sm:inline">Controls</span>
            </Button>
          )}

          <div className="flex shrink-0 items-center gap-2 rounded-xl border border-border/80 bg-card/90 px-2.5 py-1.5 shadow-2xs backdrop-blur-md sm:px-3">
            <span className="flex size-6 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-2xs">
              <IconLink className="size-3.5" stroke={2.2} aria-hidden="true" />
            </span>
            <span className="font-heading text-sm font-semibold tracking-tight">
              PrettyLink
            </span>
          </div>

          <Badge
            variant="outline"
            className="hidden max-w-[220px] truncate bg-card/80 font-mono text-[11px] text-muted-foreground md:inline-flex xl:max-w-[300px]"
          >
            {formatDisplayUrl(state.url)} · {width}×{height}
          </Badge>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-border/80 bg-card/90 p-1 shadow-2xs backdrop-blur-md">
          {(onUndo || onRedo) && (
            <>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={!canUndo}
                      onClick={onUndo}
                      aria-label="Undo last change"
                      className="[@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:min-w-10"
                    />
                  }
                >
                  <IconArrowBackUp className="size-4" aria-hidden="true" />
                </TooltipTrigger>
                <TooltipContent>Undo (⌘Z / Ctrl+Z)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={!canRedo}
                      onClick={onRedo}
                      aria-label="Redo change"
                      className="[@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:min-w-10"
                    />
                  }
                >
                  <IconArrowForwardUp className="size-4" aria-hidden="true" />
                </TooltipTrigger>
                <TooltipContent>Redo (⌘⇧Z / Ctrl+Y)</TooltipContent>
              </Tooltip>

              <div className="mx-0.5 h-4 w-px bg-border" />
            </>
          )}

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onRandomize}
                  aria-label="Randomize gradient and frame style"
                  className="h-8 gap-1.5 px-2.5 text-xs [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:min-w-10"
                />
              }
            >
              <IconDice5 className="size-4" aria-hidden="true" />
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
                  className="[@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:min-w-10"
                />
              }
            >
              <IconRestore className="size-4" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>Reset to default preset</TooltipContent>
          </Tooltip>

          <div className="mx-0.5 hidden h-4 w-px bg-border md:block" />

          <div className="hidden items-center gap-0.5 md:flex">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setZoom((z) => Math.max(0.65, Number((z - 0.1).toFixed(2))))}
              aria-label="Zoom out"
            >
              <IconZoomOut className="size-4" aria-hidden="true" />
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
              <IconZoomIn className="size-4" aria-hidden="true" />
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
                  aria-label={sharedCopied ? "Share link copied" : "Copy shareable link"}
                  className="h-8 gap-1.5 px-2.5 text-xs [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:min-w-10"
                />
              }
            >
              {sharedCopied ? (
                <IconCheck className="size-4 text-primary" aria-hidden="true" />
              ) : (
                <IconShare2 className="size-4" aria-hidden="true" />
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
                  className="[@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:min-w-10"
                />
              }
            >
              <IconSun className="hidden size-4 dark:block" aria-hidden="true" />
              <IconMoon className="block size-4 dark:hidden" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>
              Toggle light / dark theme
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      {/* Center Stage Artwork */}
      <div className="relative my-2 flex min-h-0 flex-1 items-center justify-center p-1 sm:my-3 sm:p-4 lg:p-6">
        <MockupFrame
          state={state}
          isFetching={isFetching}
          previewGeneration={previewGeneration}
          zoomMultiplier={zoom}
          maxWidthPx={580}
          maxHeightPx={540}
          onChange={onChange}
        />
      </div>

      {/* Bottom Quick-Template Dropdown (smaller screens / compact stage) & Inline Strip (wide desktop) */}
      <footer className="flex flex-wrap items-center justify-center gap-2">
        {savingPreset && (
          <form
            onSubmit={handleCommitSavePreset}
            className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-card/95 p-1.5 shadow-md backdrop-blur-md"
          >
            <Input
              ref={presetInputRef}
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Preset name…"
              maxLength={32}
              aria-label="Custom preset name"
              className="h-7 w-36 rounded-lg px-2 text-xs"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!presetName.trim()}
              className="h-7 rounded-lg px-2.5 text-[11px] font-semibold"
            >
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={closeSavePresetForm}
              aria-label="Cancel saving preset"
              className="size-7 rounded-lg"
            >
              <IconX className="size-3.5" aria-hidden="true" />
            </Button>
          </form>
        )}

        <div className="flex max-w-full items-center justify-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              ref={presetsTriggerRef}
              className="group inline-flex h-10 max-w-full min-w-0 items-center gap-2 rounded-xl border border-border/80 bg-card/90 px-3 text-xs font-medium text-foreground shadow-2xs backdrop-blur-md transition-colors hover:bg-muted/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none data-popup-open:bg-muted data-popup-open:ring-1 data-popup-open:ring-border [@media(pointer:coarse)]:min-h-11"
            >
              {activePresetDisplay ? (
                <span
                  style={{ backgroundImage: activePresetDisplay.swatch }}
                  className="size-3 shrink-0 rounded-full ring-1 ring-white/20"
                />
              ) : (
                <IconSparkles
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
              <span className="shrink-0 text-[11px] text-muted-foreground">
                Presets
              </span>
              <span className="min-w-0 truncate font-medium">
                {activePresetDisplay ? activePresetDisplay.name : "Choose…"}
              </span>
              <IconChevronDown
                className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 group-data-popup-open:rotate-180"
                aria-hidden="true"
              />
            </DropdownMenuTrigger>

            <DropdownMenuContent
              side="top"
              align="center"
              sideOffset={8}
              className="max-h-[min(24rem,calc(100dvh-6rem))] w-[min(18.5rem,calc(100dvw-2rem))] overflow-y-auto p-1.5"
            >
              <DropdownMenuRadioGroup value={activePresetDisplay?.id ?? ""}>
                <DropdownMenuGroupLabel>Quick Presets</DropdownMenuGroupLabel>
                {QUICK_TEMPLATES.map((tpl) => (
                  <DropdownMenuRadioItem
                    key={tpl.id}
                    value={tpl.id}
                    closeOnClick
                    onClick={() => onApplyTemplate(tpl.patch)}
                    className="min-h-9 [@media(pointer:coarse)]:min-h-11"
                  >
                    <span className="flex w-4 shrink-0 items-center justify-center text-primary">
                      <DropdownMenuRadioItemIndicator>
                        <IconCheck className="size-3.5" aria-hidden="true" />
                      </DropdownMenuRadioItemIndicator>
                    </span>
                    <span
                      style={{ backgroundImage: tpl.swatch }}
                      className="size-3 shrink-0 rounded-full ring-1 ring-white/20"
                    />
                    <span className="min-w-0 flex-1 truncate">{tpl.name}</span>
                    <span className="ml-auto text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                      {tpl.mode}
                    </span>
                  </DropdownMenuRadioItem>
                ))}

                {customPresets.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroupLabel>
                      Saved Presets
                    </DropdownMenuGroupLabel>
                    {customPresets.map((preset) => (
                      <div
                        key={preset.id}
                        className="flex items-center gap-1"
                      >
                        <DropdownMenuRadioItem
                          value={preset.id}
                          closeOnClick
                          onClick={() => onApplyCustomPreset?.(preset)}
                          className="min-h-9 flex-1 [@media(pointer:coarse)]:min-h-11"
                        >
                          <span className="flex w-4 shrink-0 items-center justify-center text-primary">
                            <DropdownMenuRadioItemIndicator>
                              <IconCheck
                                className="size-3.5"
                                aria-hidden="true"
                              />
                            </DropdownMenuRadioItemIndicator>
                          </span>
                          <span
                            style={{ backgroundImage: preset.swatch }}
                            className="size-3 shrink-0 rounded-full ring-1 ring-white/20"
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {preset.name}
                          </span>
                          <span className="ml-auto text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                            {preset.mode}
                          </span>
                        </DropdownMenuRadioItem>
                        {onDeleteCustomPreset && (
                          <DropdownMenuItem
                            closeOnClick={false}
                            onClick={(e) => {
                              e.stopPropagation()
                              onDeleteCustomPreset(preset.id)
                            }}
                            aria-label={`Delete ${preset.name} preset`}
                            className="flex size-7 shrink-0 items-center justify-center rounded-lg p-0 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive [@media(pointer:coarse)]:min-h-9 [@media(pointer:coarse)]:min-w-9"
                          >
                            <IconTrash className="size-3.5" aria-hidden="true" />
                          </DropdownMenuItem>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </DropdownMenuRadioGroup>

              {onSaveCustomPreset && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setSavingPreset(true)}
                    className="min-h-9 gap-2 font-medium text-primary [@media(pointer:coarse)]:min-h-11"
                  >
                    <IconPlus className="size-3.5" aria-hidden="true" />
                    <span>Save Current Style as Preset…</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {onOpenExport && (
          <Button
            type="button"
            variant="default"
            onClick={onOpenExport}
            className="h-10 gap-1.5 rounded-xl px-3.5 font-heading text-xs font-semibold shadow-sm lg:hidden [@media(pointer:coarse)]:min-h-11"
          >
            <IconDownload className="size-3.5" aria-hidden="true" />
            Export
          </Button>
        )}
      </footer>
    </section>
  )
}

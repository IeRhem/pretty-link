"use client"

import * as React from "react"
import {
  IconAdjustments,
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconLayoutSidebarLeftCollapse,
  IconLink,
  IconPhoto,
  IconPhotoUp,
  IconSparkles,
  IconTrash,
  IconUser,
} from "@tabler/icons-react"
import { AspectRatioPicker } from "@/components/studio/aspect-ratio-picker"
import { BackgroundControls } from "@/components/studio/background-controls"
import { SocialPlatformIcon } from "@/components/studio/social-platform-icon"
import { resolveTabAccentColor } from "@/components/studio/web-mockup-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Slider } from "@/components/ui/slider"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { SOCIAL_PLATFORM_LIST, SOCIAL_PLATFORMS } from "@/lib/social-platforms"
import {
  CALLOUT_PRESET_CHIPS,
  FONT_STYLES,
  FRAME_TILT_PRESETS,
  getFontStyleCssFamily,
} from "@/lib/presets"
import { CODE_LANGUAGES } from "@/components/studio/code-mockup-card"
import { getQrByteLength, QR_MAX_BYTE_LENGTH } from "@/lib/qr"
import type {
  BorderStyle,
  BrowserChromeStyle,
  CalloutPosition,
  ChromeTheme,
  CodeCardStyle,
  CodeLanguageId,
  CornerIconPosition,
  PosterHeadlineAlign,
  SocialCardStyle,
  StudioMode,
  StudioState,
  WebLayoutStyle,
} from "@/lib/studio-types"
import { normalizeUrl } from "@/lib/url-utils"
import { cn } from "@/lib/utils"

function BorderCornerGlyph({ variant }: { variant: BorderStyle }) {
  const d =
    variant === "sharp"
      ? "M 5 17 V 5 H 17"
      : variant === "curved"
        ? "M 5 17 V 9 Q 5 5 9 5 H 17"
        : "M 5 17 V 12 C 5 7 7 5 12 5 H 17"
  return (
    <svg
      viewBox="0 0 22 22"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

const BORDER_OPTIONS: Array<{ id: BorderStyle; label: string }> = [
  { id: "sharp", label: "Sharp" },
  { id: "curved", label: "Curved" },
  { id: "round", label: "Round" },
]

type UploadField =
  | "customScreenshotUrl"
  | "customMobileScreenshotUrl"
  | "customFaviconUrl"
  | "socialAvatarUrl"
  | "socialCoverUrl"

export function ControlSidebar({
  state,
  isFetching,
  copiedImage,
  onChange,
  onFetchUrl,
  onOpenExport,
  onQuickCopy,
  getUploadResetToken,
  getBackgroundResetToken,
  getAssetMutationToken,
  onNotify,
  onCloseMobile,
  closeButtonRef,
}: {
  state: StudioState
  isFetching: boolean
  copiedImage: boolean
  onChange: (patch: Partial<StudioState>) => void
  onFetchUrl: (urlOverride?: string) => void
  onOpenExport: () => void
  onQuickCopy: () => void
  getUploadResetToken?: () => number
  getBackgroundResetToken?: () => number
  getAssetMutationToken?: (field: UploadField) => number
  onNotify?: (message: string) => void
  onCloseMobile?: () => void
  closeButtonRef?: React.RefObject<HTMLButtonElement | null>
}) {
  const [frameSectionOpen, setFrameSectionOpen] = React.useState(true)
  const [posterSectionOpen, setPosterSectionOpen] = React.useState(true)
  const screenshotInputRef = React.useRef<HTMLInputElement>(null)
  const mobileScreenshotInputRef = React.useRef<HTMLInputElement>(null)
  const faviconInputRef = React.useRef<HTMLInputElement>(null)
  const avatarInputRef = React.useRef<HTMLInputElement>(null)
  const coverInputRef = React.useRef<HTMLInputElement>(null)
  const uploadRequestTokensRef = React.useRef<Record<UploadField, number>>({
    customScreenshotUrl: 0,
    customMobileScreenshotUrl: 0,
    customFaviconUrl: 0,
    socialAvatarUrl: 0,
    socialCoverUrl: 0,
  })
  const navIconsLabelId = React.useId()
  const webQrLabelId = React.useId()
  const socialQrLabelId = React.useId()
  const cornerIconLabelId = React.useId()
  const calloutBadgeLabelId = React.useId()
  const spotlightLabelId = React.useId()
  const codeLineNumbersLabelId = React.useId()
  const codeSnippetTextareaId = React.useId()
  const changelogHighlightsTextareaId = React.useId()
  const headlineTextLabelId = React.useId()
  const footerSignatureLabelId = React.useId()

  const handleDataUrlUpload = (
    file: File | undefined,
    field: UploadField
  ) => {
    if (!file || !file.type.startsWith("image/")) return
    const token = ++uploadRequestTokensRef.current[field]
    const resetToken = getUploadResetToken?.() ?? 0
    const startMutationToken = getAssetMutationToken?.(field) ?? 0
    const reader = new FileReader()
    reader.onload = () => {
      if (
        uploadRequestTokensRef.current[field] !== token ||
        (getUploadResetToken?.() ?? 0) !== resetToken ||
        (getAssetMutationToken?.(field) ?? 0) !== startMutationToken
      ) {
        return
      }
      if (typeof reader.result === "string") {
        onChange({ [field]: reader.result } as Partial<StudioState>)
      }
    }
    reader.readAsDataURL(file)
  }

  const qrByteLength = getQrByteLength(
    normalizeUrl(state.url) || "https://www.lerhem.space"
  )
  const qrExceedsCapacity = qrByteLength > QR_MAX_BYTE_LENGTH

  return (
    <aside className="flex min-h-0 w-full flex-1 flex-col gap-2.5 lg:h-full lg:w-[320px] lg:flex-initial lg:shrink-0 lg:gap-3 xl:w-[332px]">
      {onCloseMobile && (
        <div className="flex items-center justify-between border-b border-border/70 px-3.5 py-2.5 lg:hidden">
          <span className="font-heading text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Studio Controls
          </span>
          <Button
            ref={closeButtonRef}
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onCloseMobile}
            aria-label="Close studio controls sidebar"
            className="size-9 rounded-xl [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
          >
            <IconLayoutSidebarLeftCollapse
              className="size-4"
              aria-hidden="true"
            />
          </Button>
        </div>
      )}
      {/* Top floating Web | Social mode tray matching uploaded mockup */}
      <div className="mx-3 rounded-xl border border-border/80 bg-background/60 p-1 shadow-2xs lg:mx-0 lg:rounded-2xl lg:bg-card lg:p-1.5 lg:shadow-sm">
        <Tabs
          value={state.mode}
          onValueChange={(val) => onChange({ mode: val as StudioMode })}
        >
          <TabsList className="h-9 w-full rounded-xl bg-transparent p-0">
            <TabsTrigger
              value="web"
              className="h-9 rounded-xl font-medium data-active:bg-muted/80 data-active:text-foreground dark:data-active:bg-secondary"
            >
              Web
            </TabsTrigger>
            <TabsTrigger
              value="social"
              className="h-9 rounded-xl font-medium data-active:bg-muted/80 data-active:text-foreground dark:data-active:bg-secondary"
            >
              Social
            </TabsTrigger>
            <TabsTrigger
              value="code"
              className="h-9 rounded-xl font-medium data-active:bg-muted/80 data-active:text-foreground dark:data-active:bg-secondary"
            >
              Code
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Main controls card */}
      <div className="flex min-h-0 flex-1 flex-col lg:rounded-2xl lg:border lg:border-border/80 lg:bg-card lg:shadow-sm">
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-3.5">
            {/* URL Input Row matching uploaded mockup */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                onFetchUrl()
              }}
              className="flex items-center gap-2"
            >
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="submit"
                      variant="secondary"
                      size="icon"
                      disabled={isFetching}
                      aria-label="Fetch link preview"
                      className="size-10 shrink-0 rounded-xl border border-border/70 bg-background/70"
                    />
                  }
                >
                  {isFetching ? <Spinner /> : <IconLink className="size-4" />}
                </TooltipTrigger>
                <TooltipContent side="right">
                  Fetch live title, metadata & preview
                </TooltipContent>
              </Tooltip>

              <Input
                value={state.url}
                onChange={(e) => onChange({ url: e.target.value })}
                placeholder={
                  state.mode === "web" ? "www.lerhem.space" : "x.com/lerhem"
                }
                className="h-10 rounded-xl border-border/80 bg-background/60 px-3 text-sm"
                aria-label="Target website or social URL"
              />
            </form>

            {/* Aspect Ratio Selector */}
            <AspectRatioPicker state={state} onChange={onChange} />

            {/* Background Controls */}
            <BackgroundControls
              state={state}
              onChange={onChange}
              getUploadResetToken={
                getBackgroundResetToken ?? getUploadResetToken
              }
              onNotify={onNotify}
            />

            {/* Border Radius Selector matching uploaded mockup */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                Border
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-border/80 bg-background/50 p-1">
                {BORDER_OPTIONS.map((opt) => {
                  const active = state.borderStyle === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onChange({ borderStyle: opt.id })}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1 rounded-lg py-2 text-[11px] font-medium transition-all",
                        active
                          ? "bg-card text-foreground shadow-xs ring-1 ring-border"
                          : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                      )}
                    >
                      <BorderCornerGlyph variant={opt.id} />
                      <span>{opt.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <Separator className="opacity-60" />

            {/* Mode-Specific Frame & Content Section */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setFrameSectionOpen((v) => !v)}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  <IconAdjustments className="size-3.5" />
                  {state.mode === "web"
                    ? "Browser Frame"
                    : state.mode === "social"
                      ? "Social Card"
                      : "Code & Changelog"}
                </span>
                <IconChevronDown
                  className={cn(
                    "size-4 text-muted-foreground transition-transform",
                    frameSectionOpen && "rotate-180"
                  )}
                />
              </button>

              {frameSectionOpen && state.mode === "web" && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">
                      Layout
                    </Label>
                    <div className="grid grid-cols-3 gap-1 rounded-xl bg-background/50 p-1 ring-1 ring-border/70">
                      {(
                        [
                          { id: "offset", label: "Offset" },
                          { id: "centered", label: "Center" },
                          { id: "docked", label: "Docked" },
                          { id: "floating", label: "Float" },
                          { id: "tab", label: "Header" },
                          { id: "duo", label: "Duo" },
                        ] as Array<{ id: WebLayoutStyle; label: string }>
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onChange({ webLayout: opt.id })}
                          className={cn(
                            "rounded-lg px-0.5 py-1.5 text-[10px] font-medium transition-colors sm:text-[11px]",
                            state.webLayout === opt.id
                              ? "bg-card text-foreground shadow-2xs ring-1 ring-border"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">
                      Window Chrome
                    </Label>
                    <div className="grid grid-cols-3 gap-1 rounded-xl bg-background/50 p-1 ring-1 ring-border/70">
                      {(
                        [
                          { id: "chrome", label: "Chrome" },
                          { id: "safari", label: "Safari" },
                          { id: "mobile", label: "Mobile" },
                          { id: "arc", label: "Arc" },
                          { id: "minimal", label: "Min" },
                          { id: "none", label: "None" },
                        ] as Array<{ id: BrowserChromeStyle; label: string }>
                      ).map((opt) => {
                        const isHeaderLayout = state.webLayout === "tab"
                        const isDisabled =
                          isHeaderLayout &&
                          opt.id !== "chrome" &&
                          opt.id !== "mobile"
                        const isActive = isHeaderLayout
                          ? opt.id ===
                            (state.browserChrome === "mobile"
                              ? "mobile"
                              : "chrome")
                          : state.browserChrome === opt.id
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            disabled={isDisabled}
                            onClick={() => onChange({ browserChrome: opt.id })}
                            className={cn(
                              "rounded-lg py-1.5 text-[11px] font-medium transition-colors",
                              isActive
                                ? "bg-card text-foreground shadow-2xs ring-1 ring-border"
                                : isDisabled
                                  ? "cursor-not-allowed text-muted-foreground opacity-40"
                                  : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {opt.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">
                      Chrome Theme
                    </Label>
                    <div className="grid grid-cols-3 gap-1 rounded-xl bg-background/50 p-1 ring-1 ring-border/70">
                      {(["light", "dark", "glass"] as ChromeTheme[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => onChange({ chromeTheme: t })}
                          className={cn(
                            "rounded-lg py-1.5 text-[11px] font-medium capitalize transition-colors",
                            state.chromeTheme === t
                              ? "bg-card text-foreground shadow-2xs ring-1 ring-border"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>Scale</span>
                        <span className="font-mono">{state.frameScale}%</span>
                      </div>
                      <Slider
                        min={60}
                        max={140}
                        step={1}
                        value={[state.frameScale]}
                        onValueChange={(v) =>
                          onChange({
                            frameScale: Array.isArray(v) ? (v[0] ?? 100) : v,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>Shadow</span>
                        <span className="font-mono">{state.frameShadow}%</span>
                      </div>
                      <Slider
                        min={0}
                        max={100}
                        step={5}
                        value={[state.frameShadow]}
                        onValueChange={(v) =>
                          onChange({
                            frameShadow: Array.isArray(v) ? (v[0] ?? 65) : v,
                          })
                        }
                      />
                    </div>
                  </div>

                  {/* Browser Position X / Y */}
                  <div className="space-y-1.5 rounded-xl border border-border/70 bg-background/40 p-2.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-[11px] text-muted-foreground">
                        Position
                      </Label>
                      {(state.frameOffsetX !== 0 || state.frameOffsetY !== 0) && (
                        <button
                          type="button"
                          onClick={() =>
                            onChange({ frameOffsetX: 0, frameOffsetY: 0 })
                          }
                          className="text-[10px] font-medium text-muted-foreground hover:text-foreground"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span>X</span>
                          <span className="font-mono tabular-nums">
                            {state.frameOffsetX > 0 ? `+${state.frameOffsetX}` : state.frameOffsetX}%
                          </span>
                        </div>
                        <Slider
                          min={-50}
                          max={50}
                          step={1}
                          value={[state.frameOffsetX]}
                          onValueChange={(v) =>
                            onChange({
                              frameOffsetX: Array.isArray(v) ? (v[0] ?? 0) : v,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span>Y</span>
                          <span className="font-mono tabular-nums">
                            {state.frameOffsetY > 0 ? `+${state.frameOffsetY}` : state.frameOffsetY}%
                          </span>
                        </div>
                        <Slider
                          min={-50}
                          max={50}
                          step={1}
                          value={[state.frameOffsetY]}
                          onValueChange={(v) =>
                            onChange({
                              frameOffsetY: Array.isArray(v) ? (v[0] ?? 0) : v,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>

                  {(state.webLayout === "tab" ||
                    state.browserChrome === "chrome" ||
                    state.browserChrome === "mobile") && (
                    <div className="flex items-center justify-between px-0.5">
                      <Label
                        id={navIconsLabelId}
                        className="text-xs text-muted-foreground"
                      >
                        Navigation Icons
                      </Label>
                      <Switch
                        aria-labelledby={navIconsLabelId}
                        checked={state.showNavButtons}
                        onCheckedChange={(checked) =>
                          onChange({ showNavButtons: checked })
                        }
                      />
                    </div>
                  )}

                  <div className="space-y-1 px-0.5">
                    <div className="flex items-center justify-between">
                      <Label
                        id={webQrLabelId}
                        className="text-xs text-muted-foreground"
                      >
                        Scannable QR Badge
                      </Label>
                      <Switch
                        aria-labelledby={webQrLabelId}
                        checked={state.webShowQr}
                        onCheckedChange={(checked) =>
                          onChange({ webShowQr: checked })
                        }
                      />
                    </div>
                    {state.webShowQr && qrExceedsCapacity && (
                      <p
                        role="alert"
                        className="text-[11px] leading-snug text-destructive"
                      >
                        URL exceeds {QR_MAX_BYTE_LENGTH} bytes ({qrByteLength}B) for QR export. Shorten the URL or turn off the QR badge to export.
                      </p>
                    )}
                  </div>

                  {state.webLayout === "tab" ? (
                    <div className="space-y-2.5 rounded-xl border border-border/70 bg-background/40 p-2.5">
                      {state.browserChrome !== "mobile" && (
                        <>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">
                              Tab Title
                            </Label>
                            <Input
                              value={state.tabTitle}
                              onChange={(e) =>
                                onChange({ tabTitle: e.target.value })
                              }
                              placeholder="Lerhem Studio"
                              className="h-8 text-xs"
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <Label className="text-[11px] text-muted-foreground">
                                URL Accent
                              </Label>
                              {state.tabAccentColor && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onChange({ tabAccentColor: "" })
                                  }
                                  className="text-[10px] font-medium text-muted-foreground hover:text-foreground"
                                >
                                  Auto
                                </button>
                              )}
                            </div>
                            <label className="flex items-center justify-between rounded-lg border border-border/70 bg-card/70 px-2.5 py-1.5 text-xs">
                              <span className="font-mono text-[11px] uppercase text-muted-foreground">
                                {resolveTabAccentColor(state)}
                              </span>
                              <input
                                type="color"
                                value={resolveTabAccentColor(state)}
                                onChange={(e) =>
                                  onChange({ tabAccentColor: e.target.value })
                                }
                                aria-label="Tab URL accent color"
                                className="h-5 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
                              />
                            </label>
                          </div>
                        </>
                      )}

                      <div className="flex gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs"
                          onClick={() => faviconInputRef.current?.click()}
                        >
                          <IconPhotoUp />
                          {state.customFaviconUrl
                            ? "Replace Icon"
                            : "Upload Icon"}
                        </Button>
                        {state.customFaviconUrl && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => {
                              uploadRequestTokensRef.current.customFaviconUrl += 1
                              onChange({ customFaviconUrl: "" })
                            }}
                            aria-label="Clear custom icon"
                          >
                            <IconTrash />
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <input
                        ref={screenshotInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          e.target.value = ""
                          handleDataUrlUpload(file, "customScreenshotUrl")
                        }}
                      />
                      <input
                        ref={mobileScreenshotInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          e.target.value = ""
                          handleDataUrlUpload(
                            file,
                            "customMobileScreenshotUrl"
                          )
                        }}
                      />
                      <div className="space-y-1.5">
                        <div className="flex gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="flex-1 text-xs"
                            onClick={() => screenshotInputRef.current?.click()}
                          >
                            <IconPhotoUp />
                            {state.customScreenshotUrl
                              ? "Replace Screenshot"
                              : "Upload Screenshot"}
                          </Button>
                          {state.customScreenshotUrl && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => {
                                uploadRequestTokensRef.current.customScreenshotUrl += 1
                                onChange({ customScreenshotUrl: "" })
                              }}
                              aria-label="Clear custom screenshot"
                            >
                              <IconTrash />
                            </Button>
                          )}
                        </div>
                        {state.webLayout === "duo" && (
                          <div className="flex gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="flex-1 text-xs"
                              onClick={() =>
                                mobileScreenshotInputRef.current?.click()
                              }
                            >
                              <IconPhotoUp />
                              {state.customMobileScreenshotUrl
                                ? "Replace Mobile Shot"
                                : "Upload Mobile Shot"}
                            </Button>
                            {state.customMobileScreenshotUrl && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => {
                                  uploadRequestTokensRef.current.customMobileScreenshotUrl += 1
                                  onChange({ customMobileScreenshotUrl: "" })
                                }}
                                aria-label="Clear custom mobile screenshot"
                              >
                                <IconTrash />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {frameSectionOpen && state.mode === "social" && (
                <div className="space-y-3">
                  {/* Platform Picker */}
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">
                      Platform
                    </Label>
                    <div className="grid grid-cols-5 gap-1">
                      {SOCIAL_PLATFORM_LIST.slice(0, 10).map((p) => {
                        const active = state.socialPlatform === p.id
                        return (
                          <button
                            key={p.id}
                            type="button"
                            title={p.name}
                            onClick={() =>
                              onChange({
                                socialPlatform: p.id,
                                socialCtaLabel: p.defaultCta,
                              })
                            }
                            className={cn(
                              "flex h-8 items-center justify-center rounded-lg border transition-colors",
                              active
                                ? "border-primary bg-primary/15 text-foreground"
                                : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground"
                            )}
                          >
                            <SocialPlatformIcon
                              platform={p.id}
                              className="size-4"
                            />
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Card Style */}
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">
                      Card Style
                    </Label>
                    <div className="grid grid-cols-5 gap-1 rounded-xl bg-background/50 p-1 ring-1 ring-border/70">
                      {(
                        [
                          { id: "elevated", label: "Split" },
                          { id: "glass", label: "Cover" },
                          { id: "bento", label: "Bento" },
                          { id: "browser", label: "Web" },
                          { id: "pill", label: "Pill" },
                        ] as Array<{ id: SocialCardStyle; label: string }>
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onChange({ socialCardStyle: opt.id })}
                          className={cn(
                            "rounded-lg px-0.5 py-1.5 text-[10px] font-medium transition-colors sm:text-[11px]",
                            state.socialCardStyle === opt.id
                              ? "bg-card text-foreground shadow-2xs ring-1 ring-border"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Card Theme */}
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-background/50 p-1 ring-1 ring-border/70">
                    {(["dark", "light", "glass"] as ChromeTheme[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => onChange({ socialCardTheme: t })}
                        className={cn(
                          "rounded-lg py-1.5 text-[11px] font-medium capitalize transition-colors",
                          state.socialCardTheme === t
                            ? "bg-card text-foreground shadow-2xs ring-1 ring-border"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">
                        Name
                      </Label>
                      <Input
                        value={state.socialDisplayName}
                        onChange={(e) =>
                          onChange({ socialDisplayName: e.target.value })
                        }
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">
                        Handle
                      </Label>
                      <Input
                        value={state.socialHandle}
                        onChange={(e) =>
                          onChange({ socialHandle: e.target.value })
                        }
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">
                      Description
                    </Label>
                    <Textarea
                      value={state.socialBio}
                      onChange={(e) => onChange({ socialBio: e.target.value })}
                      rows={2}
                      className="min-h-14 text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">
                        Metrics
                      </Label>
                      <Input
                        value={state.socialMetrics}
                        onChange={(e) =>
                          onChange({ socialMetrics: e.target.value })
                        }
                        placeholder="4.9 Rating · 125 Posts · 12.4K Followers"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">
                        CTA Label
                      </Label>
                      <Input
                        value={state.socialCtaLabel}
                        onChange={(e) =>
                          onChange({ socialCtaLabel: e.target.value })
                        }
                        placeholder={
                          SOCIAL_PLATFORMS[state.socialPlatform]?.defaultCta ??
                          "Get in Touch"
                        }
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>

                  {/* Avatar & Cover photo upload */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) =>
                          handleDataUrlUpload(
                            e.target.files?.[0],
                            "socialAvatarUrl"
                          )
                        }
                      />
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-w-0 flex-1 px-2 text-xs"
                          onClick={() => avatarInputRef.current?.click()}
                        >
                          <IconUser className="shrink-0" />
                          <span className="truncate">
                            {state.socialAvatarUrl ? "Avatar" : "Upload Avatar"}
                          </span>
                        </Button>
                        {state.socialAvatarUrl && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onChange({ socialAvatarUrl: "" })}
                            aria-label="Clear custom avatar"
                          >
                            <IconTrash />
                          </Button>
                        )}
                      </div>
                    </div>

                    <div>
                      <input
                        ref={coverInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) =>
                          handleDataUrlUpload(
                            e.target.files?.[0],
                            "socialCoverUrl"
                          )
                        }
                      />
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-w-0 flex-1 px-2 text-xs"
                          onClick={() => coverInputRef.current?.click()}
                        >
                          <IconPhoto className="shrink-0" />
                          <span className="truncate">
                            {state.socialCoverUrl ? "Cover" : "Upload Cover"}
                          </span>
                        </Button>
                        {state.socialCoverUrl && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onChange({ socialCoverUrl: "" })}
                            aria-label="Clear custom cover photo"
                          >
                            <IconTrash />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-0.5">
                    <Label className="text-xs text-muted-foreground">
                      Verified Badge
                    </Label>
                    <Switch
                      checked={state.socialVerified}
                      onCheckedChange={(checked) =>
                        onChange({ socialVerified: checked })
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label
                        id={socialQrLabelId}
                        className="text-xs text-muted-foreground"
                      >
                        Scannable QR Code
                      </Label>
                      <Switch
                        aria-labelledby={socialQrLabelId}
                        checked={state.socialShowQr}
                        onCheckedChange={(checked) =>
                          onChange({ socialShowQr: checked })
                        }
                      />
                    </div>
                    {state.socialShowQr && qrExceedsCapacity && (
                      <p
                        role="alert"
                        className="text-[11px] leading-snug text-destructive"
                      >
                        URL exceeds {QR_MAX_BYTE_LENGTH} bytes ({qrByteLength}B) for QR export. Shorten the URL or turn off the QR code to export.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {frameSectionOpen && state.mode === "code" && (
                <div className="space-y-3">
                  {/* Card Style: Code Snippet vs Changelog */}
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-muted-foreground">
                      Card Type
                    </Label>
                    <div className="grid grid-cols-2 gap-1 rounded-xl bg-background/50 p-1 ring-1 ring-border/70">
                      {(
                        [
                          { id: "snippet", label: "Code Snippet" },
                          { id: "changelog", label: "Changelog" },
                        ] as Array<{ id: CodeCardStyle; label: string }>
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => onChange({ codeCardStyle: opt.id })}
                          className={cn(
                            "rounded-lg py-1.5 text-[11px] font-medium transition-colors",
                            state.codeCardStyle === opt.id
                              ? "bg-card text-foreground shadow-2xs ring-1 ring-border"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Theme */}
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-background/50 p-1 ring-1 ring-border/70">
                    {(["dark", "light", "glass"] as ChromeTheme[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => onChange({ codeTheme: t })}
                        className={cn(
                          "rounded-lg py-1.5 text-[11px] font-medium capitalize transition-colors",
                          state.codeTheme === t
                            ? "bg-card text-foreground shadow-2xs ring-1 ring-border"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {state.codeCardStyle === "snippet" ? (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">
                            Filename
                          </Label>
                          <Input
                            value={state.codeFilename}
                            onChange={(e) =>
                              onChange({ codeFilename: e.target.value })
                            }
                            placeholder="prettylink.config.ts"
                            className="h-8 font-mono text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">
                            Language
                          </Label>
                          <select
                            value={state.codeLanguage}
                            onChange={(e) =>
                              onChange({
                                codeLanguage: e.target.value as CodeLanguageId,
                              })
                            }
                            aria-label="Code language"
                            className="h-8 w-full rounded-lg border border-border/80 bg-background/60 px-2 text-xs text-foreground"
                          >
                            {CODE_LANGUAGES.map((lang) => (
                              <option key={lang.id} value={lang.id}>
                                {lang.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label
                          htmlFor={codeSnippetTextareaId}
                          className="text-[11px] text-muted-foreground"
                        >
                          Code Snippet
                        </Label>
                        <Textarea
                          id={codeSnippetTextareaId}
                          value={state.codeContent}
                          onChange={(e) =>
                            onChange({ codeContent: e.target.value })
                          }
                          rows={5}
                          className="min-h-24 font-mono text-xs"
                        />
                      </div>

                      <div className="flex items-center justify-between pt-0.5">
                        <Label
                          id={codeLineNumbersLabelId}
                          className="text-xs text-muted-foreground"
                        >
                          Line Numbers
                        </Label>
                        <Switch
                          aria-labelledby={codeLineNumbersLabelId}
                          checked={state.codeShowLineNumbers}
                          onCheckedChange={(checked) =>
                            onChange({ codeShowLineNumbers: checked })
                          }
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">
                            Version
                          </Label>
                          <Input
                            value={state.changelogVersion}
                            onChange={(e) =>
                              onChange({ changelogVersion: e.target.value })
                            }
                            placeholder="v2.4.0"
                            className="h-8 font-mono text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">
                            Release Label
                          </Label>
                          <Input
                            value={state.changelogDate}
                            onChange={(e) =>
                              onChange({ changelogDate: e.target.value })
                            }
                            placeholder="Just Shipped"
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">
                          Release Title
                        </Label>
                        <Input
                          value={state.changelogTitle}
                          onChange={(e) =>
                            onChange({ changelogTitle: e.target.value })
                          }
                          placeholder="Interactive Stage & Duo Device Showcases"
                          className="h-8 text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label
                          htmlFor={changelogHighlightsTextareaId}
                          className="text-[11px] text-muted-foreground"
                        >
                          Highlights (prefix + New, * Improved, ✓ Fixed)
                        </Label>
                        <Textarea
                          id={changelogHighlightsTextareaId}
                          value={state.changelogItems}
                          onChange={(e) =>
                            onChange({ changelogItems: e.target.value })
                          }
                          rows={4}
                          className="min-h-20 text-xs"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {frameSectionOpen && (
                <div className="space-y-1.5 pt-1">
                  <Label className="text-[11px] text-muted-foreground">
                    3D Perspective Tilt
                  </Label>
                  <div className="grid grid-cols-4 gap-1 rounded-xl bg-background/50 p-1 ring-1 ring-border/70">
                    {FRAME_TILT_PRESETS.map((preset) => {
                      const active =
                        (state.frameTilt ?? "flat") === preset.id
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => onChange({ frameTilt: preset.id })}
                          className={cn(
                            "rounded-lg py-1.5 text-[10px] font-medium transition-colors sm:text-[11px]",
                            active
                              ? "bg-card text-foreground shadow-2xs ring-1 ring-border"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {preset.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <Separator className="opacity-60" />

            {/* Poster & Branding Overlays Section */}
            <div className="space-y-3">
              <input
                ref={faviconInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ""
                  handleDataUrlUpload(file, "customFaviconUrl")
                }}
              />
              <button
                type="button"
                onClick={() => setPosterSectionOpen((v) => !v)}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  <IconSparkles className="size-3.5" />
                  Poster &amp; Branding
                </span>
                <IconChevronDown
                  className={cn(
                    "size-4 text-muted-foreground transition-transform",
                    posterSectionOpen && "rotate-180"
                  )}
                />
              </button>

              {posterSectionOpen && (
                <div className="space-y-3">
                  {/* Typography Style Picker */}
                  <div className="space-y-1.5 rounded-xl border border-border/70 bg-background/40 p-2.5">
                    <Label className="text-xs text-muted-foreground">
                      Typography Style
                    </Label>
                    <div className="grid grid-cols-4 gap-1 rounded-xl bg-background/50 p-1 ring-1 ring-border/70">
                      {FONT_STYLES.map((font) => {
                        const active =
                          (state.fontStyle ?? "instrument") === font.id
                        return (
                          <button
                            key={font.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => onChange({ fontStyle: font.id })}
                            className={cn(
                              "flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium transition-colors",
                              active
                                ? "bg-card text-foreground shadow-2xs ring-1 ring-border"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            <span
                              style={{
                                fontFamily: getFontStyleCssFamily(font.id),
                              }}
                              className="text-xs font-bold leading-none"
                            >
                              {font.previewSample}
                            </span>
                            <span>{font.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Spotlight Focus Overlay */}
                  <div className="space-y-2 rounded-xl border border-border/70 bg-background/40 p-2.5">
                    <div className="flex items-center justify-between">
                      <Label
                        id={spotlightLabelId}
                        className="text-xs text-muted-foreground"
                      >
                        Spotlight Focus
                      </Label>
                      <Switch
                        aria-labelledby={spotlightLabelId}
                        checked={state.showSpotlight}
                        onCheckedChange={(checked) =>
                          onChange({ showSpotlight: checked })
                        }
                      />
                    </div>
                    {state.showSpotlight && (
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-muted-foreground">
                            <span>Radius</span>
                            <span className="font-mono tabular-nums">
                              {state.spotlightRadius}%
                            </span>
                          </div>
                          <Slider
                            min={12}
                            max={55}
                            step={1}
                            value={[state.spotlightRadius]}
                            onValueChange={(v) =>
                              onChange({
                                spotlightRadius: Array.isArray(v)
                                  ? (v[0] ?? 28)
                                  : v,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-muted-foreground">
                            <span>Backdrop Dim</span>
                            <span className="font-mono tabular-nums">
                              {state.spotlightDim}%
                            </span>
                          </div>
                          <Slider
                            min={20}
                            max={85}
                            step={5}
                            value={[state.spotlightDim]}
                            onValueChange={(v) =>
                              onChange({
                                spotlightDim: Array.isArray(v)
                                  ? (v[0] ?? 55)
                                  : v,
                              })
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Callout / Annotation Badge */}
                  <div className="space-y-2 rounded-xl border border-border/70 bg-background/40 p-2.5">
                    <div className="flex items-center justify-between">
                      <Label
                        id={calloutBadgeLabelId}
                        className="text-xs text-muted-foreground"
                      >
                        Callout Badge
                      </Label>
                      <Switch
                        aria-labelledby={calloutBadgeLabelId}
                        checked={state.showCalloutBadge}
                        onCheckedChange={(checked) =>
                          onChange({ showCalloutBadge: checked })
                        }
                      />
                    </div>
                    {state.showCalloutBadge && (
                      <div className="space-y-2 pt-1">
                        <Input
                          value={state.calloutText}
                          onChange={(e) =>
                            onChange({ calloutText: e.target.value })
                          }
                          placeholder="New Release"
                          maxLength={36}
                          aria-label="Callout badge text"
                          className="h-8 text-xs"
                        />
                        <div className="flex flex-wrap gap-1">
                          {CALLOUT_PRESET_CHIPS.map((chip) => {
                            const active = state.calloutText === chip
                            return (
                              <button
                                key={chip}
                                type="button"
                                onClick={() => onChange({ calloutText: chip })}
                                className={cn(
                                  "rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors",
                                  active
                                    ? "border-primary/60 bg-primary/15 text-foreground"
                                    : "border-border/70 bg-background/50 text-muted-foreground hover:text-foreground"
                                )}
                              >
                                {chip}
                              </button>
                            )
                          })}
                        </div>
                        <div
                          role="group"
                          aria-label="Callout badge position"
                          className="grid grid-cols-3 gap-1 rounded-xl bg-background/50 p-1 ring-1 ring-border/70"
                        >
                          {(
                            [
                              { id: "top-left", label: "Left" },
                              { id: "top-center", label: "Center" },
                              { id: "top-right", label: "Right" },
                            ] as Array<{
                              id: CalloutPosition
                              label: string
                            }>
                          ).map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              aria-pressed={state.calloutPosition === opt.id}
                              onClick={() =>
                                onChange({ calloutPosition: opt.id })
                              }
                              className={cn(
                                "rounded-lg py-1 text-[11px] font-medium transition-colors",
                                state.calloutPosition === opt.id
                                  ? "bg-card text-foreground shadow-2xs ring-1 ring-border"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Corner Icon Watermark */}
                  <div className="space-y-2 rounded-xl border border-border/70 bg-background/40 p-2.5">
                    <div className="flex items-center justify-between">
                      <Label
                        id={cornerIconLabelId}
                        className="text-xs text-muted-foreground"
                      >
                        Corner Icon Watermark
                      </Label>
                      <Switch
                        aria-labelledby={cornerIconLabelId}
                        checked={state.showCornerIcon}
                        onCheckedChange={(checked) =>
                          onChange({ showCornerIcon: checked })
                        }
                      />
                    </div>
                    {state.showCornerIcon && (
                      <div className="space-y-2 pt-1">
                        <div className="grid grid-cols-3 gap-1 rounded-xl bg-background/50 p-1 ring-1 ring-border/70">
                          {(
                            [
                              { id: "top-left", label: "Left" },
                              { id: "top-center", label: "Center" },
                              { id: "top-right", label: "Right" },
                            ] as Array<{
                              id: CornerIconPosition
                              label: string
                            }>
                          ).map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() =>
                                onChange({ cornerIconPosition: opt.id })
                              }
                              className={cn(
                                "rounded-lg py-1 text-[11px] font-medium transition-colors",
                                state.cornerIconPosition === opt.id
                                  ? "bg-card text-foreground shadow-2xs ring-1 ring-border"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="flex-1 text-xs"
                            onClick={() => faviconInputRef.current?.click()}
                          >
                            <IconPhotoUp />
                            {state.customFaviconUrl
                              ? "Replace Icon"
                              : "Upload Icon"}
                          </Button>
                          {state.customFaviconUrl && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => {
                                uploadRequestTokensRef.current.customFaviconUrl += 1
                                onChange({ customFaviconUrl: "" })
                              }}
                              aria-label="Clear custom icon"
                            >
                              <IconTrash />
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Headline Text */}
                  <div className="space-y-2 rounded-xl border border-border/70 bg-background/40 p-2.5">
                    <div className="flex items-center justify-between">
                      <Label
                        id={headlineTextLabelId}
                        className="text-xs text-muted-foreground"
                      >
                        Headline Text
                      </Label>
                      <Switch
                        aria-labelledby={headlineTextLabelId}
                        checked={state.showPosterHeader}
                        onCheckedChange={(checked) =>
                          onChange({ showPosterHeader: checked })
                        }
                      />
                    </div>
                    {state.showPosterHeader && (
                      <div className="space-y-2 pt-1">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">
                            Main Title
                          </Label>
                          <Textarea
                            value={state.posterHeadline}
                            onChange={(e) =>
                              onChange({ posterHeadline: e.target.value })
                            }
                            placeholder={"Digital\nProduct"}
                            rows={2}
                            className="min-h-14 text-xs"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">
                            Muted Accent Word
                          </Label>
                          <Input
                            value={state.posterAccentText}
                            onChange={(e) =>
                              onChange({ posterAccentText: e.target.value })
                            }
                            placeholder="Showcase"
                            className="h-8 text-xs"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-muted-foreground">
                            <span>Text Size</span>
                            <span className="font-mono tabular-nums">
                              {state.posterHeadlineSize}%
                            </span>
                          </div>
                          <Slider
                            min={60}
                            max={140}
                            step={5}
                            value={[state.posterHeadlineSize]}
                            onValueChange={(v) =>
                              onChange({
                                posterHeadlineSize: Array.isArray(v)
                                  ? (v[0] ?? 100)
                                  : v,
                              })
                            }
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">
                            Alignment
                          </Label>
                          <div className="grid grid-cols-3 gap-1 rounded-xl bg-background/50 p-1 ring-1 ring-border/70">
                            {(
                              [
                                {
                                  id: "left",
                                  label: "Left",
                                  icon: IconAlignLeft,
                                },
                                {
                                  id: "center",
                                  label: "Center",
                                  icon: IconAlignCenter,
                                },
                                {
                                  id: "right",
                                  label: "Right",
                                  icon: IconAlignRight,
                                },
                              ] as Array<{
                                id: PosterHeadlineAlign
                                label: string
                                icon: React.ComponentType<{
                                  className?: string
                                }>
                              }>
                            ).map((opt) => {
                              const AlignIcon = opt.icon
                              return (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() =>
                                    onChange({ posterHeadlineAlign: opt.id })
                                  }
                                  className={cn(
                                    "flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-medium transition-colors",
                                    state.posterHeadlineAlign === opt.id
                                      ? "bg-card text-foreground shadow-2xs ring-1 ring-border"
                                      : "text-muted-foreground hover:text-foreground"
                                  )}
                                >
                                  <AlignIcon className="size-3.5" />
                                  <span>{opt.label}</span>
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer Signature */}
                  <div className="space-y-2 rounded-xl border border-border/70 bg-background/40 p-2.5">
                    <div className="flex items-center justify-between">
                      <Label
                        id={footerSignatureLabelId}
                        className="text-xs text-muted-foreground"
                      >
                        Footer Signature
                      </Label>
                      <Switch
                        aria-labelledby={footerSignatureLabelId}
                        checked={state.showPosterFooter}
                        onCheckedChange={(checked) =>
                          onChange({ showPosterFooter: checked })
                        }
                      />
                    </div>
                    {state.showPosterFooter && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">
                            Brand
                          </Label>
                          <Input
                            value={state.posterFooterTitle}
                            onChange={(e) =>
                              onChange({ posterFooterTitle: e.target.value })
                            }
                            placeholder="leRhem"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-muted-foreground">
                            Domain
                          </Label>
                          <Input
                            value={state.posterFooterSubtitle}
                            onChange={(e) =>
                              onChange({ posterFooterSubtitle: e.target.value })
                            }
                            placeholder="lerhem.space"
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        {/* Bottom sticky Export + Quick Copy bar matching uploaded mockup */}
        <div className="flex items-center gap-2 border-t border-border/70 p-3">
          <Button
            type="button"
            variant="default"
            onClick={onOpenExport}
            className="h-10 flex-1 rounded-xl font-heading text-sm font-semibold shadow-sm"
          >
            Export
          </Button>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="default"
                  size="icon-lg"
                  onClick={onQuickCopy}
                  aria-label="Copy PNG to clipboard"
                  className="size-10 shrink-0 rounded-xl shadow-sm"
                />
              }
            >
              {copiedImage ? (
                <IconCheck className="size-4" />
              ) : (
                <IconCopy className="size-4" />
              )}
            </TooltipTrigger>
            <TooltipContent side="top">Copy PNG to clipboard</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </aside>
  )
}

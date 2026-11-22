"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { useTheme } from "next-themes"
import { ControlSidebar } from "@/components/studio/control-sidebar"
import { ExportDialog } from "@/components/studio/export-dialog"
import { PreviewStage } from "@/components/studio/preview-stage"
import { copyStudioImageToClipboard } from "@/lib/export-canvas"
import {
  ASPECT_RATIOS,
  BACKGROUND_PATTERNS,
  GRADIENT_PRESETS,
} from "@/lib/presets"
import { detectSocialPlatform, SOCIAL_PLATFORMS } from "@/lib/social-platforms"
import {
  DEFAULT_STUDIO_STATE,
  type BrowserChromeStyle,
  type LinkMetadata,
  type StudioState,
  type WebLayoutStyle,
} from "@/lib/studio-types"
import { decodeShareState, encodeShareState } from "@/lib/url-utils"

export function StudioWorkspace() {
  const searchParams = useSearchParams()
  const { resolvedTheme, setTheme } = useTheme()
  const remixParam = searchParams.get("remix")

  const [state, setState] = React.useState<StudioState>(() => {
    if (!remixParam) return DEFAULT_STUDIO_STATE
    const decoded = decodeShareState(remixParam)
    return decoded
      ? { ...DEFAULT_STUDIO_STATE, ...decoded, metadata: null }
      : DEFAULT_STUDIO_STATE
  })
  const [isFetching, setIsFetching] = React.useState(false)
  const [previewGeneration, setPreviewGeneration] = React.useState(0)
  const [exportOpen, setExportOpen] = React.useState(false)
  const [copiedImage, setCopiedImage] = React.useState(false)
  const [toast, setToast] = React.useState<string | null>(null)

  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const fetchAbortRef = React.useRef<AbortController | null>(null)
  const lastFetchedUrlRef = React.useRef<string>("")

  const notify = React.useCallback((message: string) => {
    setToast(message)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 2600)
  }, [])

  const updateState = React.useCallback((patch: Partial<StudioState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch }
      if (patch.url !== undefined && patch.url.trim() !== prev.url.trim()) {
        next.metadata = null
        next.customScreenshotUrl = ""
        if (
          prev.url === "www.lerhem.space" &&
          prev.tabTitle === "Lerhem Studio" &&
          patch.tabTitle === undefined
        ) {
          next.tabTitle = ""
        }
      }
      // Auto-sync social platform detection when URL changes
      if (patch.url !== undefined && patch.socialPlatform === undefined) {
        const detected = detectSocialPlatform(patch.url)
        if (detected.platform !== "custom") {
          next.socialPlatform = detected.platform
          next.socialHandle = detected.handle
          if (!prev.metadata) {
            next.socialDisplayName = detected.displayName
            next.socialCtaLabel =
              SOCIAL_PLATFORMS[detected.platform]?.defaultCta ?? "Visit Link"
          }
        }
      }
      return next
    })
  }, [])

  const fetchPreview = React.useCallback(
    async (urlOverride?: string) => {
      const target = (urlOverride ?? state.url).trim()
      if (!target) return

      lastFetchedUrlRef.current = target
      fetchAbortRef.current?.abort()
      const controller = new AbortController()
      fetchAbortRef.current = controller

      setIsFetching(true)
      try {
        const res = await fetch(
          `/api/preview?url=${encodeURIComponent(target)}`,
          { signal: controller.signal }
        )
        const data = (await res.json()) as LinkMetadata & { error?: string }
        if (controller.signal.aborted) return

        if (!res.ok) {
          notify(data.error || "Could not fetch preview for that URL")
          return
        }

        const platformConfig =
          SOCIAL_PLATFORMS[data.detectedPlatform] ?? SOCIAL_PLATFORMS.custom

        setState((prev) => ({
          ...prev,
          metadata: data,
          customScreenshotUrl: "",
          socialPlatform: data.detectedPlatform,
          socialDisplayName: data.title || prev.socialDisplayName,
          socialHandle: data.handle || prev.socialHandle,
          socialBio: data.description ?? "",
          socialMetrics: data.metrics ?? "",
          socialCtaLabel: platformConfig.defaultCta,
          socialAvatarUrl: data.avatarUrl ?? "",
          socialCoverUrl: data.coverUrl ?? "",
        }))
        setPreviewGeneration((g) => g + 1)
        notify(`Loaded preview for ${data.displayUrl}`)
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return
        }
        notify("Network error while fetching preview")
      } finally {
        if (fetchAbortRef.current === controller) {
          setIsFetching(false)
        }
      }
    },
    [state.url, notify]
  )

  // Auto-fetch preview smoothly when the user pastes or finishes typing a domain
  React.useEffect(() => {
    const trimmed = state.url.trim()
    if (!trimmed || trimmed === lastFetchedUrlRef.current) return

    const stripped = trimmed.replace(/^https?:\/\//i, "")
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}([:/?#].*)?$/i.test(stripped)) {
      return
    }

    const timer = setTimeout(() => {
      void fetchPreview(trimmed)
    }, 380)

    return () => clearTimeout(timer)
  }, [state.url, fetchPreview])

  const handleQuickCopy = React.useCallback(async () => {
    try {
      await copyStudioImageToClipboard(state, 2)
      setCopiedImage(true)
      notify("Copied high-res PNG to clipboard")
      setTimeout(() => setCopiedImage(false), 1800)
    } catch (err) {
      notify(err instanceof Error ? err.message : "Clipboard copy failed")
    }
  }, [state, notify])

  const handleShareLink = React.useCallback(async () => {
    const encoded = encodeShareState(state)
    const shareUrl = `${window.location.origin}/share?d=${encoded}`
    try {
      await navigator.clipboard.writeText(shareUrl)
      notify("Copied shareable PrettyLink URL")
    } catch {
      notify("Open Export to copy your shareable link")
    }
  }, [state, notify])

  const handleRandomize = React.useCallback(() => {
    const grad =
      GRADIENT_PRESETS[Math.floor(Math.random() * GRADIENT_PRESETS.length)]!
    const layouts: WebLayoutStyle[] = ["offset", "centered", "docked", "floating"]
    const chromes: BrowserChromeStyle[] = ["chrome", "safari", "arc", "minimal"]
    const ratios = ASPECT_RATIOS.filter((r) => r.id !== "custom")
    const randomRatio = ratios[Math.floor(Math.random() * ratios.length)]!
    const randomPattern =
      BACKGROUND_PATTERNS[
        Math.floor(Math.random() * BACKGROUND_PATTERNS.length)
      ]!

    setState((prev) => ({
      ...prev,
      aspectRatioId: randomRatio.id,
      customWidth: randomRatio.width,
      customHeight: randomRatio.height,
      backgroundType: "color",
      colorFillMode: "gradient",
      gradientId: grad.id,
      gradientFrom: grad.from,
      gradientVia: grad.via ?? "",
      gradientTo: grad.to,
      gradientAngle: grad.angle,
      bgPattern: randomPattern.id,
      webLayout: layouts[Math.floor(Math.random() * layouts.length)]!,
      browserChrome: chromes[Math.floor(Math.random() * chromes.length)]!,
      chromeTheme: Math.random() > 0.45 ? "light" : "dark",
    }))
  }, [])

  const handleReset = React.useCallback(() => {
    fetchAbortRef.current?.abort()
    lastFetchedUrlRef.current = ""
    setIsFetching(false)
    setPreviewGeneration((g) => g + 1)
    setState(DEFAULT_STUDIO_STATE)
    void fetchPreview(DEFAULT_STUDIO_STATE.url)
    notify("Reset studio to default showcase")
  }, [fetchPreview, notify])

  const handleToggleTheme = React.useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark")
  }, [resolvedTheme, setTheme])

  const handleApplyTemplate = React.useCallback(
    (patch: Partial<StudioState>) => {
      fetchAbortRef.current?.abort()
      setIsFetching(false)
      setPreviewGeneration((g) => g + 1)
      setState((prev) => ({
        ...prev,
        bgPattern: DEFAULT_STUDIO_STATE.bgPattern,
        bgPatternOpacity: DEFAULT_STUDIO_STATE.bgPatternOpacity,
        borderStyle: DEFAULT_STUDIO_STATE.borderStyle,
        frameScale: DEFAULT_STUDIO_STATE.frameScale,
        frameOffsetX: DEFAULT_STUDIO_STATE.frameOffsetX,
        frameOffsetY: DEFAULT_STUDIO_STATE.frameOffsetY,
        frameShadow: DEFAULT_STUDIO_STATE.frameShadow,
        showNavButtons: DEFAULT_STUDIO_STATE.showNavButtons,
        webShowQr: DEFAULT_STUDIO_STATE.webShowQr,
        showCapturedFrom: DEFAULT_STUDIO_STATE.showCapturedFrom,
        tabTitle: DEFAULT_STUDIO_STATE.tabTitle,
        tabAccentColor: DEFAULT_STUDIO_STATE.tabAccentColor,
        customFaviconUrl: DEFAULT_STUDIO_STATE.customFaviconUrl,
        showCornerIcon: DEFAULT_STUDIO_STATE.showCornerIcon,
        cornerIconPosition: DEFAULT_STUDIO_STATE.cornerIconPosition,
        showPosterHeader: DEFAULT_STUDIO_STATE.showPosterHeader,
        posterHeadline: DEFAULT_STUDIO_STATE.posterHeadline,
        posterAccentText: DEFAULT_STUDIO_STATE.posterAccentText,
        posterHeadlineAlign: DEFAULT_STUDIO_STATE.posterHeadlineAlign,
        posterHeadlineSize: DEFAULT_STUDIO_STATE.posterHeadlineSize,
        showPosterFooter: DEFAULT_STUDIO_STATE.showPosterFooter,
        posterFooterTitle: DEFAULT_STUDIO_STATE.posterFooterTitle,
        posterFooterSubtitle: DEFAULT_STUDIO_STATE.posterFooterSubtitle,
        ...patch,
        metadata: null,
        customScreenshotUrl: "",
        socialAvatarUrl: "",
        socialCoverUrl: patch.socialCoverUrl ?? "",
      }))
      if (patch.url) {
        void fetchPreview(patch.url)
      }
    },
    [fetchPreview]
  )

  // Keyboard shortcuts
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "e") {
        e.preventDefault()
        setExportOpen(true)
      } else if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "c"
      ) {
        e.preventDefault()
        void handleQuickCopy()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [handleQuickCopy])

  return (
    <main className="flex min-h-screen w-full flex-col gap-4 bg-background p-3 md:h-screen md:flex-row md:overflow-hidden md:p-4">
      <ControlSidebar
        state={state}
        isFetching={isFetching}
        copiedImage={copiedImage}
        onChange={updateState}
        onFetchUrl={fetchPreview}
        onOpenExport={() => setExportOpen(true)}
        onQuickCopy={handleQuickCopy}
      />

      <PreviewStage
        state={state}
        isFetching={isFetching}
        previewGeneration={previewGeneration}
        onToggleTheme={handleToggleTheme}
        onRandomize={handleRandomize}
        onReset={handleReset}
        onShareLink={handleShareLink}
        onApplyTemplate={handleApplyTemplate}
        onDropImage={(dataUrl) =>
          updateState({
            backgroundType: "image",
            backgroundImageUrl: dataUrl,
            unsplashPhotoId: "",
            unsplashPhotographer: "",
          })
        }
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        state={state}
        onNotify={notify}
      />

      {/* Lightweight toast notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-5 bottom-5 z-50 rounded-xl border border-border bg-card/95 px-4 py-2.5 text-xs font-medium text-foreground shadow-xl backdrop-blur-md"
        >
          {toast}
        </div>
      )}
    </main>
  )
}

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
  const [isCompactViewport, setIsCompactViewport] = React.useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)

  const drawerId = React.useId()
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const fetchAbortRef = React.useRef<AbortController | null>(null)
  const lastFetchedUrlRef = React.useRef<string>("")
  const drawerRef = React.useRef<HTMLDivElement>(null)
  const stageWrapperRef = React.useRef<HTMLDivElement>(null)
  const menuTriggerRef = React.useRef<HTMLButtonElement>(null)
  const drawerCloseBtnRef = React.useRef<HTMLButtonElement>(null)
  const exportOpenRef = React.useRef(exportOpen)

  React.useEffect(() => {
    exportOpenRef.current = exportOpen
  }, [exportOpen])

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

  // Sync compact viewport breakpoint for the slide-over controls sidebar
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023.98px)")
    const syncViewport = (matches: boolean) => {
      setIsCompactViewport(matches)
      if (!matches) {
        setMobileMenuOpen(false)
      }
    }
    syncViewport(mq.matches)
    const onMqChange = (e: MediaQueryListEvent) => syncViewport(e.matches)
    mq.addEventListener("change", onMqChange)
    return () => mq.removeEventListener("change", onMqChange)
  }, [])

  const openMobileMenu = React.useCallback(() => {
    if (!isCompactViewport) return
    setMobileMenuOpen(true)
  }, [isCompactViewport])

  const closeMobileMenu = React.useCallback((restoreFocus = true) => {
    setMobileMenuOpen(false)
    if (restoreFocus) {
      requestAnimationFrame(() => {
        menuTriggerRef.current?.focus()
      })
    }
  }, [])

  // Keep off-screen sidebar and covered preview stage inert when appropriate
  React.useEffect(() => {
    if (drawerRef.current) {
      drawerRef.current.inert = isCompactViewport && !mobileMenuOpen
    }
    if (stageWrapperRef.current) {
      stageWrapperRef.current.inert = isCompactViewport && mobileMenuOpen
    }
  }, [isCompactViewport, mobileMenuOpen])

  // Move focus into sidebar when opened and support Escape key dismissal
  React.useEffect(() => {
    if (!isCompactViewport || !mobileMenuOpen) return
    const rafId = requestAnimationFrame(() => {
      drawerCloseBtnRef.current?.focus({ preventScroll: true })
    })

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        exportOpenRef.current
      ) {
        return
      }
      if (
        document.querySelector(
          '[data-slot="popover-content"], [data-slot="dialog-content"]'
        )
      ) {
        return
      }
      event.preventDefault()
      closeMobileMenu(true)
    }
    document.addEventListener("keydown", onKeyDown)

    return () => {
      cancelAnimationFrame(rafId)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [isCompactViewport, mobileMenuOpen, closeMobileMenu])

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
    <main className="flex min-h-dvh w-full flex-col gap-3 bg-background pt-[max(0.5rem,env(safe-area-inset-top))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] sm:p-3 lg:h-dvh lg:flex-row lg:gap-4 lg:overflow-hidden lg:p-4">
      <div
        ref={drawerRef}
        id={drawerId}
        role={isCompactViewport ? "dialog" : undefined}
        aria-label={isCompactViewport ? "Studio controls" : undefined}
        aria-modal={isCompactViewport && mobileMenuOpen ? true : undefined}
        data-open={mobileMenuOpen ? "true" : "false"}
        className="studio-drawer"
      >
        <div
          className="studio-drawer-backdrop"
          aria-hidden="true"
          onClick={() => closeMobileMenu(true)}
        />
        <div className="studio-drawer-sheet">
          <ControlSidebar
            state={state}
            isFetching={isFetching}
            copiedImage={copiedImage}
            onChange={updateState}
            onFetchUrl={fetchPreview}
            onOpenExport={() => {
              if (isCompactViewport && mobileMenuOpen) {
                closeMobileMenu(false)
              }
              setExportOpen(true)
            }}
            onQuickCopy={handleQuickCopy}
            onCloseMobile={() => closeMobileMenu(true)}
            closeButtonRef={drawerCloseBtnRef}
          />
        </div>
      </div>

      <div ref={stageWrapperRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PreviewStage
          state={state}
          isFetching={isFetching}
          previewGeneration={previewGeneration}
          drawerId={drawerId}
          mobileMenuOpen={mobileMenuOpen}
          onOpenMobileMenu={openMobileMenu}
          menuTriggerRef={menuTriggerRef}
          onOpenExport={() => setExportOpen(true)}
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
      </div>

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
          className="fixed right-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 z-50 mx-auto max-w-sm rounded-xl border border-border bg-card/95 px-4 py-2.5 text-center text-xs font-medium text-foreground shadow-xl backdrop-blur-md sm:right-5 sm:bottom-5 sm:left-auto sm:mx-0 sm:max-w-none sm:text-left"
        >
          {toast}
        </div>
      )}
    </main>
  )
}

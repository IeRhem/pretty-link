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
  computeStyleSwatch,
  extractStylePresetPatch,
  GRADIENT_PRESETS,
  loadCustomPresets,
  saveCustomPresets,
  type CustomPreset,
} from "@/lib/presets"
import { detectSocialPlatform, SOCIAL_PLATFORMS } from "@/lib/social-platforms"
import {
  DEFAULT_STUDIO_STATE,
  type BrowserChromeStyle,
  type LinkMetadata,
  type StudioState,
  type WebLayoutStyle,
} from "@/lib/studio-types"
import {
  decodeShareState,
  encodeShareState,
  SHARE_STATE_MAX_LENGTH,
} from "@/lib/url-utils"

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
  const [toast, setToast] = React.useState<{
    message: string
    actionLabel?: string
    onAction?: () => void
  } | null>(null)
  const [isCompactViewport, setIsCompactViewport] = React.useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)
  const [customPresets, setCustomPresets] = React.useState<CustomPreset[]>([])
  const [history, setHistory] = React.useState<{
    past: StudioState[]
    future: StudioState[]
  }>({ past: [], future: [] })

  const drawerId = React.useId()
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const fetchAbortRef = React.useRef<AbortController | null>(null)
  const lastFetchedUrlRef = React.useRef<string>("")
  const currentUrlRef = React.useRef<string>(state.url)
  const stateRef = React.useRef<StudioState>(state)
  const lastEditTimeRef = React.useRef<number>(0)
  const uploadResetTokenRef = React.useRef(0)
  const drawerRef = React.useRef<HTMLDivElement>(null)
  const stageWrapperRef = React.useRef<HTMLDivElement>(null)
  const menuTriggerRef = React.useRef<HTMLButtonElement>(null)
  const drawerCloseBtnRef = React.useRef<HTMLButtonElement>(null)
  const exportOpenRef = React.useRef(exportOpen)

  React.useEffect(() => {
    exportOpenRef.current = exportOpen
  }, [exportOpen])

  React.useEffect(() => {
    currentUrlRef.current = state.url
    stateRef.current = state
  }, [state])

  React.useEffect(() => {
    const syncPresets = () => {
      setCustomPresets(loadCustomPresets())
    }
    const rafId = requestAnimationFrame(syncPresets)
    window.addEventListener("storage", syncPresets)
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener("storage", syncPresets)
    }
  }, [])

  const notify = React.useCallback(
    (
      message: string,
      options?: { actionLabel?: string; onAction?: () => void }
    ) => {
      setToast({
        message,
        actionLabel: options?.actionLabel,
        onAction: options?.onAction,
      })
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      toastTimerRef.current = setTimeout(
        () => setToast(null),
        options?.actionLabel ? 5200 : 2600
      )
    },
    []
  )

  const recordUndoSnapshot = React.useCallback(
    (snapshot: StudioState, forceNewStep = false) => {
      const now = Date.now()
      const shouldCoalesce =
        !forceNewStep && now - lastEditTimeRef.current < 400
      lastEditTimeRef.current = now

      setHistory((prev) => {
        if (shouldCoalesce && prev.past.length > 0) {
          return prev.future.length > 0 ? { ...prev, future: [] } : prev
        }
        const nextPast =
          prev.past.length >= 50
            ? [...prev.past.slice(prev.past.length - 49), snapshot]
            : [...prev.past, snapshot]
        return { past: nextPast, future: [] }
      })
    },
    []
  )

  const getUploadResetToken = React.useCallback(
    () => uploadResetTokenRef.current,
    []
  )

  const updateState = React.useCallback(
    (patch: Partial<StudioState>, options?: { forceHistoryStep?: boolean }) => {
      if (patch.customFaviconUrl !== undefined) {
        setPreviewGeneration((g) => g + 1)
      }
      if (patch.url !== undefined) {
        if (patch.url.trim() !== currentUrlRef.current.trim()) {
          fetchAbortRef.current?.abort()
          fetchAbortRef.current = null
          lastFetchedUrlRef.current = ""
          setIsFetching(false)
        }
        currentUrlRef.current = patch.url
      }
      recordUndoSnapshot(stateRef.current, options?.forceHistoryStep ?? false)
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
  }, [recordUndoSnapshot])

  const handleUndo = React.useCallback(() => {
    if (history.past.length === 0) return
    const previous = history.past[history.past.length - 1]!
    const current = stateRef.current
    lastEditTimeRef.current = 0
    if (previous.url.trim() !== current.url.trim()) {
      fetchAbortRef.current?.abort()
      fetchAbortRef.current = null
      lastFetchedUrlRef.current = ""
      setIsFetching(false)
      currentUrlRef.current = previous.url
    }
    setHistory((prev) => ({
      past: prev.past.slice(0, -1),
      future: [current, ...prev.future].slice(0, 50),
    }))
    setState(previous)
    setPreviewGeneration((g) => g + 1)
  }, [history.past])

  const handleRedo = React.useCallback(() => {
    if (history.future.length === 0) return
    const nextState = history.future[0]!
    const current = stateRef.current
    lastEditTimeRef.current = 0
    if (nextState.url.trim() !== current.url.trim()) {
      fetchAbortRef.current?.abort()
      fetchAbortRef.current = null
      lastFetchedUrlRef.current = ""
      setIsFetching(false)
      currentUrlRef.current = nextState.url
    }
    setHistory((prev) => ({
      past: [...prev.past, current].slice(-50),
      future: prev.future.slice(1),
    }))
    setState(nextState)
    setPreviewGeneration((g) => g + 1)
  }, [history.future])

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
        if (
          controller.signal.aborted ||
          currentUrlRef.current.trim() !== target
        ) {
          return
        }

        if (!res.ok) {
          notify(data.error || "Could not fetch preview for that URL")
          return
        }

        const platformConfig =
          SOCIAL_PLATFORMS[data.detectedPlatform] ?? SOCIAL_PLATFORMS.custom

        setState((prev) => {
          if (prev.url.trim() !== target) return prev
          return {
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
          }
        })
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
    if (encoded.length > SHARE_STATE_MAX_LENGTH) {
      notify(
        "Share link is too large. Shorten text or remove long custom URLs to share."
      )
      return
    }
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

    recordUndoSnapshot(stateRef.current, true)
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
  }, [recordUndoSnapshot])

  const handleReset = React.useCallback(() => {
    recordUndoSnapshot(stateRef.current, true)
    uploadResetTokenRef.current += 1
    fetchAbortRef.current?.abort()
    lastFetchedUrlRef.current = ""
    currentUrlRef.current = DEFAULT_STUDIO_STATE.url
    setIsFetching(false)
    setPreviewGeneration((g) => g + 1)
    setState(DEFAULT_STUDIO_STATE)
    void fetchPreview(DEFAULT_STUDIO_STATE.url)
    notify("Reset studio to default showcase")
  }, [fetchPreview, notify, recordUndoSnapshot])

  const handleToggleTheme = React.useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark")
  }, [resolvedTheme, setTheme])

  const handleApplyTemplate = React.useCallback(
    (patch: Partial<StudioState>) => {
      recordUndoSnapshot(stateRef.current, true)
      uploadResetTokenRef.current += 1
      fetchAbortRef.current?.abort()
      setIsFetching(false)
      setPreviewGeneration((g) => g + 1)
      if (patch.url !== undefined) {
        currentUrlRef.current = patch.url
      }
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
    [fetchPreview, recordUndoSnapshot]
  )

  const handleApplyCustomPreset = React.useCallback(
    (preset: CustomPreset) => {
      updateState(preset.patch, { forceHistoryStep: true })
      notify(`Applied "${preset.name}" preset`)
    },
    [updateState, notify]
  )

  const handleSaveCustomPreset = React.useCallback(
    (rawName: string) => {
      const trimmed = rawName.trim().slice(0, 32)
      if (!trimmed) return
      const current = stateRef.current
      const newPreset: CustomPreset = {
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: trimmed,
        mode: current.mode,
        swatch: computeStyleSwatch(current),
        createdAt: Date.now(),
        patch: extractStylePresetPatch(current),
      }
      setCustomPresets((prev) => {
        const next = [...prev, newPreset]
        saveCustomPresets(next)
        return next
      })
      notify(`Saved "${trimmed}" to your presets`)
    },
    [notify]
  )

  const handleDeleteCustomPreset = React.useCallback(
    (id: string) => {
      setCustomPresets((prev) => {
        const target = prev.find((p) => p.id === id)
        const next = prev.filter((p) => p.id !== id)
        saveCustomPresets(next)
        if (target) {
          notify(`Deleted "${target.name}" preset`)
        }
        return next
      })
    },
    [notify]
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

  // Keyboard shortcuts (Export, Quick Copy, Undo / Redo)
  React.useEffect(() => {
    const isEditableElement = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false
      const tag = el.tagName.toLowerCase()
      return (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        el.isContentEditable
      )
    }

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
      } else if (
        (e.metaKey || e.ctrlKey) &&
        !isEditableElement(e.target) &&
        e.key.toLowerCase() === "z"
      ) {
        e.preventDefault()
        if (e.shiftKey) {
          handleRedo()
        } else {
          handleUndo()
        }
      } else if (
        (e.metaKey || e.ctrlKey) &&
        !isEditableElement(e.target) &&
        e.key.toLowerCase() === "y"
      ) {
        e.preventDefault()
        handleRedo()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [handleQuickCopy, handleUndo, handleRedo])

  // Global clipboard image paste (Cmd/Ctrl+V) with mode-aware routing & target switch action
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      let imageFile: File | null = null
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item && item.type.startsWith("image/")) {
          imageFile = item.getAsFile()
          if (imageFile) break
        }
      }
      if (!imageFile) return

      e.preventDefault()
      const resetToken = uploadResetTokenRef.current
      const reader = new FileReader()
      reader.onload = () => {
        if (
          uploadResetTokenRef.current !== resetToken ||
          typeof reader.result !== "string"
        ) {
          return
        }
        const dataUrl = reader.result
        const current = stateRef.current

        if (current.mode === "web") {
          if (current.webLayout === "tab") {
            const prevFavicon = current.customFaviconUrl
            updateState(
              { customFaviconUrl: dataUrl },
              { forceHistoryStep: true }
            )
            notify("Pasted image as header icon", {
              actionLabel: "Use as Background",
              onAction: () => {
                updateState(
                  {
                    customFaviconUrl: prevFavicon,
                    backgroundType: "image",
                    backgroundImageUrl: dataUrl,
                    unsplashPhotoId: "",
                    unsplashPhotographer: "",
                  },
                  { forceHistoryStep: true }
                )
                notify("Applied pasted image as canvas background")
              },
            })
          } else {
            const prevScreenshot = current.customScreenshotUrl
            updateState(
              { customScreenshotUrl: dataUrl },
              { forceHistoryStep: true }
            )
            notify("Pasted image as browser screenshot", {
              actionLabel: "Use as Background",
              onAction: () => {
                updateState(
                  {
                    customScreenshotUrl: prevScreenshot,
                    backgroundType: "image",
                    backgroundImageUrl: dataUrl,
                    unsplashPhotoId: "",
                    unsplashPhotographer: "",
                  },
                  { forceHistoryStep: true }
                )
                notify("Applied pasted image as canvas background")
              },
            })
          }
        } else {
          const prevCover = current.socialCoverUrl
          updateState({ socialCoverUrl: dataUrl }, { forceHistoryStep: true })
          notify("Pasted image as social cover", {
            actionLabel: "Use as Avatar",
            onAction: () => {
              updateState(
                {
                  socialCoverUrl: prevCover,
                  socialAvatarUrl: dataUrl,
                },
                { forceHistoryStep: true }
              )
              notify("Applied pasted image as social avatar")
            },
          })
        }
      }
      reader.readAsDataURL(imageFile)
    }

    window.addEventListener("paste", onPaste)
    return () => window.removeEventListener("paste", onPaste)
  }, [updateState, notify])

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
            getUploadResetToken={getUploadResetToken}
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
          canUndo={history.past.length > 0}
          canRedo={history.future.length > 0}
          onUndo={handleUndo}
          onRedo={handleRedo}
          customPresets={customPresets}
          onApplyCustomPreset={handleApplyCustomPreset}
          onSaveCustomPreset={handleSaveCustomPreset}
          onDeleteCustomPreset={handleDeleteCustomPreset}
          onDropImage={(dataUrl) =>
            updateState(
              {
                backgroundType: "image",
                backgroundImageUrl: dataUrl,
                unsplashPhotoId: "",
                unsplashPhotographer: "",
              },
              { forceHistoryStep: true }
            )
          }
        />
      </div>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        state={state}
        onNotify={(msg) => notify(msg)}
      />

      {/* Lightweight toast notification with optional action */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 z-50 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-xl border border-border bg-card/95 px-4 py-2.5 text-xs font-medium text-foreground shadow-xl backdrop-blur-md sm:right-5 sm:bottom-5 sm:left-auto sm:mx-0 sm:max-w-none"
        >
          <span>{toast.message}</span>
          {toast.actionLabel && toast.onAction && (
            <button
              type="button"
              onClick={() => {
                const action = toast.onAction
                setToast(null)
                action?.()
              }}
              className="shrink-0 rounded-lg bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/25"
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}
    </main>
  )
}

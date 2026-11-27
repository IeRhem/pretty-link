"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { useTheme } from "next-themes"
import { ControlSidebar } from "@/components/studio/control-sidebar"
import { ExportDialog } from "@/components/studio/export-dialog"
import { PreviewStage } from "@/components/studio/preview-stage"
import { extractBrandPaletteFromState } from "@/lib/brand-palette"
import { copyStudioImageToClipboard } from "@/lib/export-canvas"
import {
  appendCustomPreset,
  ASPECT_RATIOS,
  BACKGROUND_PATTERNS,
  computeStyleSwatch,
  extractStylePresetPatch,
  GRADIENT_PRESETS,
  loadCustomPresets,
  removeCustomPreset,
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

const LAST_URL_STORAGE_KEY = "prettylink:last-url:v1"
const MAX_HISTORY_SNAPSHOTS = 50
const MAX_HISTORY_IMAGE_BYTES = 15 * 1024 * 1024 // 15 MB image-payload budget across retained history

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName.toLowerCase()
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    el.isContentEditable
  )
}

function estimateSnapshotImageBytes(snapshot: StudioState): number {
  const fields = [
    snapshot.backgroundImageUrl,
    snapshot.customScreenshotUrl,
    snapshot.customMobileScreenshotUrl,
    snapshot.customFaviconUrl,
    snapshot.socialAvatarUrl,
    snapshot.socialCoverUrl,
    snapshot.metadata?.screenshotUrl,
    snapshot.metadata?.ogImageUrl,
    snapshot.metadata?.faviconUrl,
    snapshot.metadata?.avatarUrl,
    snapshot.metadata?.coverUrl,
  ]
  let total = 0
  for (const value of fields) {
    if (value) {
      total += value.length
    }
  }
  return total
}

function enforceHistoryLimits(snapshots: StudioState[]): StudioState[] {
  const next =
    snapshots.length > MAX_HISTORY_SNAPSHOTS
      ? snapshots.slice(snapshots.length - MAX_HISTORY_SNAPSHOTS)
      : [...snapshots]

  let totalImageBytes = next.reduce(
    (sum, item) => sum + estimateSnapshotImageBytes(item),
    0
  )
  while (next.length > 0 && totalImageBytes > MAX_HISTORY_IMAGE_BYTES) {
    const evicted = next.shift()
    if (evicted) {
      totalImageBytes -= estimateSnapshotImageBytes(evicted)
    }
  }
  return next
}

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
  const bgOperationTokenRef = React.useRef(0)
  const urlRevisionRef = React.useRef(0)
  const pasteTokenRef = React.useRef(0)
  const brandPaletteSessionRef = React.useRef(0)
  const assetMutationTokenRef = React.useRef({
    screenshot: 0,
    avatar: 0,
    cover: 0,
  })
  const userOverrodeSocialAssetsRef = React.useRef({
    avatar: false,
    cover: false,
  })
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
    const rafId = requestAnimationFrame(() => {
      syncPresets()
      if (!remixParam) {
        try {
          const savedUrl = window.localStorage
            .getItem(LAST_URL_STORAGE_KEY)
            ?.trim()
          if (savedUrl && savedUrl !== stateRef.current.url.trim()) {
            currentUrlRef.current = savedUrl
            const detected = detectSocialPlatform(savedUrl)
            setState((prev) => ({
              ...prev,
              url: savedUrl,
              metadata: null,
              ...(detected.platform !== "custom"
                ? {
                    socialPlatform: detected.platform,
                    socialHandle: detected.handle,
                    socialDisplayName: detected.displayName,
                    socialCtaLabel:
                      SOCIAL_PLATFORMS[detected.platform]?.defaultCta ??
                      "Visit Link",
                  }
                : {}),
            }))
          }
        } catch {
          // Ignore storage read errors
        }
      }
    })
    window.addEventListener("storage", syncPresets)
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener("storage", syncPresets)
    }
  }, [remixParam])

  React.useEffect(() => {
    const trimmed = state.url.trim()
    if (!trimmed) return
    try {
      window.localStorage.setItem(LAST_URL_STORAGE_KEY, trimmed)
    } catch {
      // Ignore storage write errors
    }
  }, [state.url])

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
      // A forced step closes the coalescing window so the next ordinary edit starts its own step
      lastEditTimeRef.current = forceNewStep ? 0 : now

      setHistory((prev) => {
        if (shouldCoalesce && prev.past.length > 0) {
          return prev.future.length > 0 ? { ...prev, future: [] } : prev
        }
        const nextPast = enforceHistoryLimits([...prev.past, snapshot])
        return { past: nextPast, future: [] }
      })
    },
    []
  )

  const getUploadResetToken = React.useCallback(
    () => uploadResetTokenRef.current + bgOperationTokenRef.current,
    []
  )

  const updateState = React.useCallback(
    (
      patch: Partial<StudioState>,
      options?: { forceHistoryStep?: boolean; skipHistory?: boolean }
    ) => {
      if (patch.customFaviconUrl !== undefined) {
        setPreviewGeneration((g) => g + 1)
      }
      if (patch.customScreenshotUrl !== undefined) {
        assetMutationTokenRef.current.screenshot += 1
      }
      if (patch.socialAvatarUrl !== undefined) {
        assetMutationTokenRef.current.avatar += 1
        userOverrodeSocialAssetsRef.current.avatar = Boolean(
          patch.socialAvatarUrl
        )
      }
      if (patch.socialCoverUrl !== undefined) {
        assetMutationTokenRef.current.cover += 1
        userOverrodeSocialAssetsRef.current.cover = Boolean(
          patch.socialCoverUrl
        )
      }
      if (
        patch.backgroundType !== undefined ||
        patch.colorFillMode !== undefined ||
        patch.gradientId !== undefined ||
        patch.gradientFrom !== undefined ||
        patch.gradientVia !== undefined ||
        patch.gradientTo !== undefined ||
        patch.gradientAngle !== undefined ||
        patch.solidColor !== undefined ||
        patch.backgroundImageUrl !== undefined ||
        patch.unsplashPhotoId !== undefined ||
        patch.unsplashPhotographer !== undefined ||
        patch.bgPattern !== undefined ||
        patch.bgPatternOpacity !== undefined ||
        patch.bgBlur !== undefined ||
        patch.bgDim !== undefined ||
        patch.noiseOverlay !== undefined
      ) {
        bgOperationTokenRef.current += 1
      }
      if (
        patch.mode !== undefined ||
        patch.customFaviconUrl !== undefined ||
        patch.customScreenshotUrl !== undefined ||
        patch.socialAvatarUrl !== undefined ||
        patch.socialCoverUrl !== undefined ||
        patch.backgroundType !== undefined ||
        patch.colorFillMode !== undefined ||
        patch.gradientId !== undefined ||
        patch.gradientFrom !== undefined ||
        patch.gradientVia !== undefined ||
        patch.gradientTo !== undefined ||
        patch.solidColor !== undefined ||
        patch.tabAccentColor !== undefined
      ) {
        brandPaletteSessionRef.current += 1
      }
      if (patch.url !== undefined) {
        if (patch.url.trim() !== currentUrlRef.current.trim()) {
          urlRevisionRef.current += 1
          brandPaletteSessionRef.current += 1
          fetchAbortRef.current?.abort()
          fetchAbortRef.current = null
          lastFetchedUrlRef.current = ""
          setIsFetching(false)
        }
        currentUrlRef.current = patch.url
      }
      if (!options?.skipHistory) {
        recordUndoSnapshot(
          stateRef.current,
          options?.forceHistoryStep ?? false
        )
      }
      setState((prev) => {
        const next = { ...prev, ...patch }
        if (patch.url !== undefined && patch.url.trim() !== prev.url.trim()) {
          next.metadata = null
          if (patch.customScreenshotUrl === undefined) {
            next.customScreenshotUrl = ""
          }
          if (
            patch.socialAvatarUrl === undefined &&
            !userOverrodeSocialAssetsRef.current.avatar
          ) {
            next.socialAvatarUrl = ""
          }
          if (
            patch.socialCoverUrl === undefined &&
            !userOverrodeSocialAssetsRef.current.cover
          ) {
            next.socialCoverUrl = ""
          }
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

  const applyHistorySnapshot = React.useCallback(
    (
      targetSnapshot: StudioState,
      updateStacks: (current: StudioState) => void
    ) => {
      const current = stateRef.current
      lastEditTimeRef.current = 0
      uploadResetTokenRef.current += 1
      brandPaletteSessionRef.current += 1

      if (targetSnapshot.customScreenshotUrl !== current.customScreenshotUrl) {
        assetMutationTokenRef.current.screenshot += 1
      }
      if (targetSnapshot.socialAvatarUrl !== current.socialAvatarUrl) {
        assetMutationTokenRef.current.avatar += 1
      }
      if (targetSnapshot.socialCoverUrl !== current.socialCoverUrl) {
        assetMutationTokenRef.current.cover += 1
      }

      const targetTrimmed = targetSnapshot.url.trim()
      const currentTrimmed = current.url.trim()
      const sameUrl = targetTrimmed === currentTrimmed
      if (!sameUrl) {
        urlRevisionRef.current += 1
      }

      // Preserve already-fetched metadata and fetched social preview fields when restoring
      // a same-URL edit whose snapshot predated fetch completion, while keeping user-edited fields from targetSnapshot
      const effectiveMetadata =
        targetSnapshot.metadata ?? (sameUrl ? current.metadata : null)
      const backfillFromCurrentFetch =
        sameUrl && !targetSnapshot.metadata && Boolean(current.metadata)
      const detectedForUrl = detectSocialPlatform(targetSnapshot.url)

      const isPreFetchDisplayName =
        targetSnapshot.socialDisplayName ===
          DEFAULT_STUDIO_STATE.socialDisplayName ||
        targetSnapshot.socialDisplayName === detectedForUrl.displayName
      const isPreFetchHandle =
        targetSnapshot.socialHandle === DEFAULT_STUDIO_STATE.socialHandle ||
        targetSnapshot.socialHandle === detectedForUrl.handle
      const isPreFetchBio =
        !targetSnapshot.socialBio ||
        targetSnapshot.socialBio === DEFAULT_STUDIO_STATE.socialBio
      const isPreFetchMetrics =
        !targetSnapshot.socialMetrics ||
        targetSnapshot.socialMetrics === DEFAULT_STUDIO_STATE.socialMetrics

      const restoredState: StudioState = backfillFromCurrentFetch
        ? {
            ...targetSnapshot,
            metadata: effectiveMetadata,
            socialDisplayName:
              isPreFetchDisplayName && current.metadata?.title
                ? current.metadata.title
                : targetSnapshot.socialDisplayName,
            socialHandle:
              isPreFetchHandle && current.metadata?.handle
                ? current.metadata.handle
                : targetSnapshot.socialHandle,
            socialBio:
              isPreFetchBio && current.metadata?.description !== undefined
                ? current.metadata.description
                : targetSnapshot.socialBio,
            socialMetrics:
              isPreFetchMetrics && current.metadata?.metrics !== undefined
                ? (current.metadata.metrics ?? "")
                : targetSnapshot.socialMetrics,
            socialAvatarUrl:
              targetSnapshot.socialAvatarUrl ||
              (current.metadata?.avatarUrl ?? ""),
            socialCoverUrl:
              targetSnapshot.socialCoverUrl ||
              (current.metadata?.coverUrl ?? ""),
          }
        : effectiveMetadata !== targetSnapshot.metadata
          ? { ...targetSnapshot, metadata: effectiveMetadata }
          : targetSnapshot

      userOverrodeSocialAssetsRef.current.avatar = Boolean(
        restoredState.socialAvatarUrl &&
          restoredState.socialAvatarUrl !== effectiveMetadata?.avatarUrl
      )
      userOverrodeSocialAssetsRef.current.cover = Boolean(
        restoredState.socialCoverUrl &&
          restoredState.socialCoverUrl !== effectiveMetadata?.coverUrl
      )

      currentUrlRef.current = restoredState.url

      if (!sameUrl) {
        fetchAbortRef.current?.abort()
        fetchAbortRef.current = null
        setIsFetching(false)
        lastFetchedUrlRef.current = effectiveMetadata ? targetTrimmed : ""
      } else if (effectiveMetadata) {
        lastFetchedUrlRef.current = targetTrimmed
      } else if (!fetchAbortRef.current) {
        // Unfetched same-URL design with no active request: allow fetching
        lastFetchedUrlRef.current = ""
      }

      updateStacks(current)
      setState(restoredState)
      setPreviewGeneration((g) => g + 1)
    },
    []
  )

  const handleUndo = React.useCallback(() => {
    if (history.past.length === 0) return
    const previous = history.past[history.past.length - 1]!
    applyHistorySnapshot(previous, (current) => {
      setHistory((prev) => ({
        past: prev.past.slice(0, -1),
        future: [current, ...prev.future].slice(0, 50),
      }))
    })
  }, [history.past, applyHistorySnapshot])

  const handleRedo = React.useCallback(() => {
    if (history.future.length === 0) return
    const nextState = history.future[0]!
    applyHistorySnapshot(nextState, (current) => {
      setHistory((prev) => ({
        past: enforceHistoryLimits([...prev.past, current]),
        future: prev.future.slice(1),
      }))
    })
  }, [history.future, applyHistorySnapshot])

  const fetchPreview = React.useCallback(
    async (urlOverride?: string) => {
      const target = (urlOverride ?? state.url).trim()
      if (!target) return

      lastFetchedUrlRef.current = target
      fetchAbortRef.current?.abort()
      const controller = new AbortController()
      fetchAbortRef.current = controller
      const startAssetTokens = { ...assetMutationTokenRef.current }
      const paletteSession = ++brandPaletteSessionRef.current

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
          const preserveScreenshot =
            assetMutationTokenRef.current.screenshot !==
              startAssetTokens.screenshot || Boolean(prev.customScreenshotUrl)
          const preserveAvatar =
            assetMutationTokenRef.current.avatar !== startAssetTokens.avatar ||
            (userOverrodeSocialAssetsRef.current.avatar &&
              Boolean(prev.socialAvatarUrl))
          const preserveCover =
            assetMutationTokenRef.current.cover !== startAssetTokens.cover ||
            (userOverrodeSocialAssetsRef.current.cover &&
              Boolean(prev.socialCoverUrl))
          return {
            ...prev,
            metadata: data,
            customScreenshotUrl: preserveScreenshot
              ? prev.customScreenshotUrl
              : "",
            socialPlatform: data.detectedPlatform,
            socialDisplayName: data.title || prev.socialDisplayName,
            socialHandle: data.handle || prev.socialHandle,
            socialBio: data.description ?? "",
            socialMetrics: data.metrics ?? "",
            socialCtaLabel: platformConfig.defaultCta,
            socialAvatarUrl: preserveAvatar
              ? prev.socialAvatarUrl
              : (data.avatarUrl ?? ""),
            socialCoverUrl: preserveCover
              ? prev.socialCoverUrl
              : (data.coverUrl ?? ""),
          }
        })
        setPreviewGeneration((g) => g + 1)
        notify(`Loaded preview for ${data.displayUrl}`, {
          actionLabel: "Complement Colors",
          onAction: () => {
            const getContextSnapshot = (s: StudioState) =>
              [
                s.mode,
                s.url.trim(),
                s.customFaviconUrl,
                s.customScreenshotUrl,
                s.socialAvatarUrl,
                s.socialCoverUrl,
                s.backgroundType,
                s.colorFillMode,
                s.gradientId,
                s.gradientFrom,
                s.gradientVia,
                s.gradientTo,
                s.solidColor,
                s.tabAccentColor,
              ].join("|")

            if (
              brandPaletteSessionRef.current !== paletteSession ||
              stateRef.current.url.trim() !== target
            ) {
              return
            }
            const startSession = brandPaletteSessionRef.current
            const startSnapshotKey = getContextSnapshot(stateRef.current)
            void extractBrandPaletteFromState({
              ...stateRef.current,
              metadata: data,
            }).then((palette) => {
              if (
                brandPaletteSessionRef.current !== startSession ||
                stateRef.current.url.trim() !== target ||
                getContextSnapshot(stateRef.current) !== startSnapshotKey
              ) {
                return
              }
              if (!palette) {
                notify("Could not extract complementary palette from this link")
                return
              }
              updateState(
                {
                  backgroundType: "color",
                  colorFillMode: "gradient",
                  gradientId: "brand",
                  gradientFrom: palette.gradientFrom,
                  gradientVia: palette.gradientVia,
                  gradientTo: palette.gradientTo,
                  solidColor: palette.solidColor,
                  tabAccentColor: palette.tabAccentColor,
                },
                { forceHistoryStep: true }
              )
              notify(`Applied dim complementary backdrop (${palette.gradientVia})`)
            })
          },
        })
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
    [state.url, notify, updateState]
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
    const current = stateRef.current
    const preservedUrl = current.url.trim() || DEFAULT_STUDIO_STATE.url
    const preservedMetadata = current.metadata
    const detected = detectSocialPlatform(preservedUrl)
    const platformId =
      preservedMetadata?.detectedPlatform ??
      (detected.platform !== "custom"
        ? detected.platform
        : DEFAULT_STUDIO_STATE.socialPlatform)
    const platformConfig =
      SOCIAL_PLATFORMS[platformId] ?? SOCIAL_PLATFORMS.custom

    recordUndoSnapshot(current, true)
    uploadResetTokenRef.current += 1
    brandPaletteSessionRef.current += 1
    userOverrodeSocialAssetsRef.current = { avatar: false, cover: false }
    currentUrlRef.current = preservedUrl
    setPreviewGeneration((g) => g + 1)
    setState({
      ...DEFAULT_STUDIO_STATE,
      url: preservedUrl,
      metadata: preservedMetadata,
      socialPlatform: platformId,
      socialDisplayName:
        preservedMetadata?.title ||
        (detected.platform !== "custom"
          ? detected.displayName
          : DEFAULT_STUDIO_STATE.socialDisplayName),
      socialHandle:
        preservedMetadata?.handle ||
        (detected.platform !== "custom"
          ? detected.handle
          : DEFAULT_STUDIO_STATE.socialHandle),
      socialBio:
        preservedMetadata?.description ?? DEFAULT_STUDIO_STATE.socialBio,
      socialMetrics:
        preservedMetadata?.metrics ?? DEFAULT_STUDIO_STATE.socialMetrics,
      socialCtaLabel: platformConfig.defaultCta,
      socialAvatarUrl: preservedMetadata?.avatarUrl ?? "",
      socialCoverUrl: preservedMetadata?.coverUrl ?? "",
    })
    if (!preservedMetadata) {
      lastFetchedUrlRef.current = ""
      void fetchPreview(preservedUrl)
    }
    notify("Reset studio settings")
  }, [fetchPreview, notify, recordUndoSnapshot])

  const handleToggleTheme = React.useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark")
  }, [resolvedTheme, setTheme])

  const handleApplyTemplate = React.useCallback(
    (patch: Partial<StudioState>) => {
      recordUndoSnapshot(stateRef.current, true)
      uploadResetTokenRef.current += 1
      brandPaletteSessionRef.current += 1
      userOverrodeSocialAssetsRef.current = {
        avatar: false,
        cover: Boolean(patch.socialCoverUrl),
      }
      setPreviewGeneration((g) => g + 1)
      setState((prev) => {
        const preservedUrl = prev.url.trim() || patch.url || DEFAULT_STUDIO_STATE.url
        const preservedMetadata = prev.metadata
        currentUrlRef.current = preservedUrl
        return {
          ...prev,
          bgPattern: DEFAULT_STUDIO_STATE.bgPattern,
          bgPatternOpacity: DEFAULT_STUDIO_STATE.bgPatternOpacity,
          bgBlur: DEFAULT_STUDIO_STATE.bgBlur,
          bgDim: DEFAULT_STUDIO_STATE.bgDim,
          noiseOverlay: DEFAULT_STUDIO_STATE.noiseOverlay,
          backgroundImageUrl: DEFAULT_STUDIO_STATE.backgroundImageUrl,
          unsplashPhotoId: DEFAULT_STUDIO_STATE.unsplashPhotoId,
          unsplashPhotographer: DEFAULT_STUDIO_STATE.unsplashPhotographer,
          borderStyle: DEFAULT_STUDIO_STATE.borderStyle,
          frameScale: DEFAULT_STUDIO_STATE.frameScale,
          frameOffsetX: DEFAULT_STUDIO_STATE.frameOffsetX,
          frameOffsetY: DEFAULT_STUDIO_STATE.frameOffsetY,
          frameShadow: DEFAULT_STUDIO_STATE.frameShadow,
          frameTilt: DEFAULT_STUDIO_STATE.frameTilt,
          showSpotlight: DEFAULT_STUDIO_STATE.showSpotlight,
          spotlightX: DEFAULT_STUDIO_STATE.spotlightX,
          spotlightY: DEFAULT_STUDIO_STATE.spotlightY,
          spotlightRadius: DEFAULT_STUDIO_STATE.spotlightRadius,
          spotlightDim: DEFAULT_STUDIO_STATE.spotlightDim,
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
          fontStyle: DEFAULT_STUDIO_STATE.fontStyle,
          showCalloutBadge: DEFAULT_STUDIO_STATE.showCalloutBadge,
          calloutText: DEFAULT_STUDIO_STATE.calloutText,
          calloutPosition: DEFAULT_STUDIO_STATE.calloutPosition,
          ...patch,
          url: preservedUrl,
          metadata: preservedMetadata,
          ...(preservedMetadata
            ? {
                socialDisplayName:
                  preservedMetadata.title ||
                  patch.socialDisplayName ||
                  prev.socialDisplayName,
                socialHandle:
                  preservedMetadata.handle ||
                  patch.socialHandle ||
                  prev.socialHandle,
                socialBio:
                  preservedMetadata.description ||
                  patch.socialBio ||
                  prev.socialBio,
                socialMetrics:
                  preservedMetadata.metrics ||
                  patch.socialMetrics ||
                  prev.socialMetrics,
                socialAvatarUrl: preservedMetadata.avatarUrl ?? "",
                socialCoverUrl:
                  patch.socialCoverUrl ?? preservedMetadata.coverUrl ?? "",
              }
            : {
                socialAvatarUrl: "",
                socialCoverUrl: patch.socialCoverUrl ?? "",
              }),
        }
      })
    },
    [recordUndoSnapshot]
  )

  const handleApplyCustomPreset = React.useCallback(
    (preset: CustomPreset) => {
      brandPaletteSessionRef.current += 1
      updateState(
        { ...preset.patch, mode: preset.mode },
        { forceHistoryStep: true }
      )
      notify(`Applied "${preset.name}" preset`)
    },
    [updateState, notify]
  )

  const handleSaveCustomPreset = React.useCallback(
    (rawName: string): boolean => {
      const trimmed = rawName.trim().slice(0, 32)
      if (!trimmed) return false
      const current = stateRef.current
      const newPreset: CustomPreset = {
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: trimmed,
        mode: current.mode,
        swatch: computeStyleSwatch(current),
        createdAt: Date.now(),
        patch: extractStylePresetPatch(current),
      }
      const { ok, presets } = appendCustomPreset(newPreset, customPresets)
      if (!ok) {
        notify("Could not save preset: browser storage is full or unavailable")
        return false
      }
      setCustomPresets(presets)
      notify(`Saved "${trimmed}" to your presets`)
      return true
    },
    [customPresets, notify]
  )

  const handleDeleteCustomPreset = React.useCallback(
    (id: string) => {
      const { ok, presets, removed } = removeCustomPreset(id, customPresets)
      if (!ok) {
        notify("Could not update presets in browser storage")
        return
      }
      setCustomPresets(presets)
      if (removed) {
        notify(`Deleted "${removed.name}" preset`)
      }
    },
    [customPresets, notify]
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
        !isEditableTarget(e.target) &&
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
        !isEditableTarget(e.target) &&
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
      if (e.defaultPrevented || isEditableTarget(e.target)) return
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
      const pasteToken = ++pasteTokenRef.current
      const resetToken = uploadResetTokenRef.current
      const startUrlRevision = urlRevisionRef.current
      const startUrl = stateRef.current.url.trim()
      const isCurrentPaste = () =>
        pasteTokenRef.current === pasteToken &&
        uploadResetTokenRef.current === resetToken &&
        urlRevisionRef.current === startUrlRevision &&
        stateRef.current.url.trim() === startUrl

      const reader = new FileReader()
      reader.onload = () => {
        if (!isCurrentPaste() || typeof reader.result !== "string") {
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
                const latest = stateRef.current
                if (
                  latest.mode !== "web" ||
                  latest.webLayout !== "tab" ||
                  latest.customFaviconUrl !== dataUrl
                ) {
                  return
                }
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
                const latest = stateRef.current
                if (
                  latest.mode !== "web" ||
                  latest.webLayout === "tab" ||
                  latest.customScreenshotUrl !== dataUrl
                ) {
                  return
                }
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
          const prevCoverWasOverride = userOverrodeSocialAssetsRef.current.cover
          updateState({ socialCoverUrl: dataUrl }, { forceHistoryStep: true })
          notify("Pasted image as social cover", {
            actionLabel: "Use as Avatar",
            onAction: () => {
              const latest = stateRef.current
              if (
                latest.mode !== "social" ||
                latest.socialCoverUrl !== dataUrl
              ) {
                return
              }
              updateState(
                {
                  socialCoverUrl: prevCover,
                  socialAvatarUrl: dataUrl,
                },
                { forceHistoryStep: true }
              )
              userOverrodeSocialAssetsRef.current.cover =
                prevCoverWasOverride && Boolean(prevCover)
              notify("Applied pasted image as social avatar")
            },
          })
        }
      }
      reader.onerror = () => {
        if (!isCurrentPaste()) return
        notify("Could not read pasted clipboard image")
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
            onNotify={(msg) => notify(msg)}
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
          getUploadResetToken={getUploadResetToken}
          onChange={updateState}
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

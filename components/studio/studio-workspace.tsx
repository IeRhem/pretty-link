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

function enforceCombinedHistoryLimits(
  past: StudioState[],
  future: StudioState[],
  options?: { incomingPast?: StudioState; incomingFuture?: StudioState }
): { past: StudioState[]; future: StudioState[] } {
  const basePast =
    options?.incomingPast !== undefined
      ? estimateSnapshotImageBytes(options.incomingPast) <=
        MAX_HISTORY_IMAGE_BYTES
        ? [...past, options.incomingPast]
        : [...past]
      : [...past]
  const baseFuture =
    options?.incomingFuture !== undefined
      ? estimateSnapshotImageBytes(options.incomingFuture) <=
        MAX_HISTORY_IMAGE_BYTES
        ? [options.incomingFuture, ...future]
        : [...future]
      : [...future]

  const nextPast =
    basePast.length > MAX_HISTORY_SNAPSHOTS
      ? basePast.slice(basePast.length - MAX_HISTORY_SNAPSHOTS)
      : basePast
  const nextFuture =
    baseFuture.length > MAX_HISTORY_SNAPSHOTS
      ? baseFuture.slice(0, MAX_HISTORY_SNAPSHOTS)
      : baseFuture

  let totalImageBytes =
    nextPast.reduce((sum, item) => sum + estimateSnapshotImageBytes(item), 0) +
    nextFuture.reduce((sum, item) => sum + estimateSnapshotImageBytes(item), 0)

  while (
    nextPast.length + nextFuture.length > MAX_HISTORY_SNAPSHOTS ||
    (nextPast.length + nextFuture.length > 0 &&
      totalImageBytes > MAX_HISTORY_IMAGE_BYTES)
  ) {
    if (nextPast.length >= nextFuture.length && nextPast.length > 0) {
      const evicted = nextPast.shift()
      if (evicted) {
        totalImageBytes -= estimateSnapshotImageBytes(evicted)
      }
    } else if (nextFuture.length > 0) {
      const evicted = nextFuture.pop()
      if (evicted) {
        totalImageBytes -= estimateSnapshotImageBytes(evicted)
      }
    } else {
      break
    }
  }

  return { past: nextPast, future: nextFuture }
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
  const lastEditKeyRef = React.useRef<string>("")
  const hasRestoredUrlRef = React.useRef(false)
  const pendingRestoredUrlRef = React.useRef<string | null>(null)
  const uploadResetTokenRef = React.useRef(0)
  const bgOperationTokenRef = React.useRef(0)
  const urlRevisionRef = React.useRef(0)
  const pasteTokenRef = React.useRef(0)
  const brandPaletteSessionRef = React.useRef(0)
  const assetMutationTokenRef = React.useRef({
    screenshot: 0,
    mobileScreenshot: 0,
    favicon: 0,
    avatar: 0,
    cover: 0,
  })
  const userOverrodeSocialAssetsRef = React.useRef({
    avatar: false,
    cover: false,
  })
  const snapshotSocialOverridesRef = React.useRef(
    new WeakMap<StudioState, { avatar: boolean; cover: boolean }>()
  )
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
    let savedUrlToRestore: string | null = null
    if (!remixParam) {
      try {
        const savedUrl = window.localStorage
          .getItem(LAST_URL_STORAGE_KEY)
          ?.trim()
        if (savedUrl && savedUrl !== stateRef.current.url.trim()) {
          savedUrlToRestore = savedUrl
          pendingRestoredUrlRef.current = savedUrl
        }
      } catch {
        // Ignore storage read errors
      }
    }
    hasRestoredUrlRef.current = true

    const rafId = requestAnimationFrame(() => {
      syncPresets()
      if (savedUrlToRestore) {
        pendingRestoredUrlRef.current = null
        currentUrlRef.current = savedUrlToRestore
        const detected = detectSocialPlatform(savedUrlToRestore)
        setState((prev) => ({
          ...prev,
          url: savedUrlToRestore,
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
    })
    window.addEventListener("storage", syncPresets)
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener("storage", syncPresets)
    }
  }, [remixParam])

  React.useEffect(() => {
    if (!hasRestoredUrlRef.current || pendingRestoredUrlRef.current !== null) {
      return
    }
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
    (snapshot: StudioState, forceNewStep = false, editKey = "") => {
      const now = Date.now()
      const shouldCoalesce =
        !forceNewStep &&
        Boolean(editKey) &&
        editKey === lastEditKeyRef.current &&
        now - lastEditTimeRef.current < 400
      // A forced step closes the coalescing window so the next ordinary edit starts its own step
      lastEditTimeRef.current = forceNewStep ? 0 : now
      lastEditKeyRef.current = forceNewStep ? "" : editKey
      snapshotSocialOverridesRef.current.set(snapshot, {
        ...userOverrodeSocialAssetsRef.current,
      })

      setHistory((prev) => {
        if (shouldCoalesce && prev.past.length > 0) {
          return prev.future.length > 0 ? { ...prev, future: [] } : prev
        }
        return enforceCombinedHistoryLimits(prev.past, [], {
          incomingPast: snapshot,
        })
      })
    },
    []
  )

  const getUploadResetToken = React.useCallback(
    () => uploadResetTokenRef.current,
    []
  )

  const getBackgroundResetToken = React.useCallback(
    () => uploadResetTokenRef.current + bgOperationTokenRef.current,
    []
  )

  const getAssetMutationToken = React.useCallback(
    (
      field:
        | "customScreenshotUrl"
        | "customMobileScreenshotUrl"
        | "customFaviconUrl"
        | "socialAvatarUrl"
        | "socialCoverUrl"
    ) => {
      switch (field) {
        case "customScreenshotUrl":
          return assetMutationTokenRef.current.screenshot
        case "customMobileScreenshotUrl":
          return assetMutationTokenRef.current.mobileScreenshot
        case "customFaviconUrl":
          return assetMutationTokenRef.current.favicon
        case "socialAvatarUrl":
          return assetMutationTokenRef.current.avatar
        case "socialCoverUrl":
          return assetMutationTokenRef.current.cover
      }
    },
    []
  )

  const updateState = React.useCallback(
    (
      patch: Partial<StudioState>,
      options?: { forceHistoryStep?: boolean; skipHistory?: boolean }
    ) => {
      if (!options?.skipHistory) {
        const editKey = Object.keys(patch).sort().join(",")
        recordUndoSnapshot(
          stateRef.current,
          options?.forceHistoryStep ?? false,
          editKey
        )
      }
      if (patch.customFaviconUrl !== undefined) {
        assetMutationTokenRef.current.favicon += 1
        setPreviewGeneration((g) => g + 1)
      }
      if (patch.customScreenshotUrl !== undefined) {
        assetMutationTokenRef.current.screenshot += 1
      }
      if (patch.customMobileScreenshotUrl !== undefined) {
        assetMutationTokenRef.current.mobileScreenshot += 1
      }
      if (patch.socialAvatarUrl !== undefined) {
        assetMutationTokenRef.current.avatar += 1
        userOverrodeSocialAssetsRef.current.avatar = true
      }
      if (patch.socialCoverUrl !== undefined) {
        assetMutationTokenRef.current.cover += 1
        userOverrodeSocialAssetsRef.current.cover = true
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
        patch.webLayout !== undefined ||
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
        patch.tabAccentColor !== undefined ||
        patch.bgDim !== undefined
      ) {
        brandPaletteSessionRef.current += 1
      }
      if (patch.url !== undefined) {
        if (patch.url.trim() !== currentUrlRef.current.trim()) {
          urlRevisionRef.current += 1
          brandPaletteSessionRef.current += 1
          if (patch.customScreenshotUrl === undefined) {
            assetMutationTokenRef.current.screenshot += 1
          }
          if (patch.customMobileScreenshotUrl === undefined) {
            assetMutationTokenRef.current.mobileScreenshot += 1
          }
          if (patch.customFaviconUrl === undefined) {
            assetMutationTokenRef.current.favicon += 1
          }
          if (patch.socialAvatarUrl === undefined) {
            userOverrodeSocialAssetsRef.current.avatar = false
            assetMutationTokenRef.current.avatar += 1
          }
          if (patch.socialCoverUrl === undefined) {
            userOverrodeSocialAssetsRef.current.cover = false
            assetMutationTokenRef.current.cover += 1
          }
          fetchAbortRef.current?.abort()
          fetchAbortRef.current = null
          lastFetchedUrlRef.current = ""
          setIsFetching(false)
        }
        currentUrlRef.current = patch.url
      }
      setState((prev) => {
        const next = { ...prev, ...patch }
        if (patch.url !== undefined && patch.url.trim() !== prev.url.trim()) {
          next.metadata = null
          if (patch.customScreenshotUrl === undefined) {
            next.customScreenshotUrl = ""
          }
          if (patch.customMobileScreenshotUrl === undefined) {
            next.customMobileScreenshotUrl = ""
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
      lastEditKeyRef.current = ""
      uploadResetTokenRef.current += 1
      brandPaletteSessionRef.current += 1

      if (targetSnapshot.customScreenshotUrl !== current.customScreenshotUrl) {
        assetMutationTokenRef.current.screenshot += 1
      }
      if (
        targetSnapshot.customMobileScreenshotUrl !==
        current.customMobileScreenshotUrl
      ) {
        assetMutationTokenRef.current.mobileScreenshot += 1
      }
      if (targetSnapshot.customFaviconUrl !== current.customFaviconUrl) {
        assetMutationTokenRef.current.favicon += 1
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

      // Retain the current refreshed preview metadata and fetched fields when restoring
      // a same-URL snapshot, while restoring historical design fields and user overrides
      const effectiveMetadata = sameUrl
        ? (current.metadata ?? targetSnapshot.metadata)
        : targetSnapshot.metadata
      const backfillFromCurrentFetch =
        sameUrl &&
        Boolean(current.metadata) &&
        current.metadata !== targetSnapshot.metadata
      const detectedForUrl = detectSocialPlatform(targetSnapshot.url)
      const oldMeta = targetSnapshot.metadata

      const isFetchedOrDefaultDisplayName =
        targetSnapshot.socialDisplayName ===
          DEFAULT_STUDIO_STATE.socialDisplayName ||
        targetSnapshot.socialDisplayName === detectedForUrl.displayName ||
        (Boolean(oldMeta?.title) &&
          targetSnapshot.socialDisplayName === oldMeta?.title)
      const isFetchedOrDefaultHandle =
        targetSnapshot.socialHandle === DEFAULT_STUDIO_STATE.socialHandle ||
        targetSnapshot.socialHandle === detectedForUrl.handle ||
        (Boolean(oldMeta?.handle) &&
          targetSnapshot.socialHandle === oldMeta?.handle)
      const isFetchedOrDefaultBio =
        !targetSnapshot.socialBio ||
        targetSnapshot.socialBio === DEFAULT_STUDIO_STATE.socialBio ||
        (oldMeta !== null &&
          targetSnapshot.socialBio === (oldMeta.description ?? ""))
      const isFetchedOrDefaultMetrics =
        !targetSnapshot.socialMetrics ||
        targetSnapshot.socialMetrics === DEFAULT_STUDIO_STATE.socialMetrics ||
        (oldMeta !== null &&
          targetSnapshot.socialMetrics === (oldMeta.metrics ?? ""))
      const snapshotOverrides =
        snapshotSocialOverridesRef.current.get(targetSnapshot)
      const avatarWasOverridden =
        snapshotOverrides?.avatar ??
        (oldMeta !== null
          ? targetSnapshot.socialAvatarUrl !== (oldMeta.avatarUrl ?? "")
          : Boolean(targetSnapshot.socialAvatarUrl))
      const coverWasOverridden =
        snapshotOverrides?.cover ??
        (oldMeta !== null
          ? targetSnapshot.socialCoverUrl !== (oldMeta.coverUrl ?? "")
          : Boolean(targetSnapshot.socialCoverUrl))

      const isFetchedOrEmptyAvatar =
        !avatarWasOverridden &&
        (oldMeta === null
          ? !targetSnapshot.socialAvatarUrl
          : targetSnapshot.socialAvatarUrl === (oldMeta.avatarUrl ?? ""))
      const isFetchedOrEmptyCover =
        !coverWasOverridden &&
        (oldMeta === null
          ? !targetSnapshot.socialCoverUrl
          : targetSnapshot.socialCoverUrl === (oldMeta.coverUrl ?? ""))

      const restoredState: StudioState = backfillFromCurrentFetch
        ? {
            ...targetSnapshot,
            metadata: effectiveMetadata,
            socialDisplayName:
              isFetchedOrDefaultDisplayName && current.metadata?.title
                ? current.metadata.title
                : targetSnapshot.socialDisplayName,
            socialHandle:
              isFetchedOrDefaultHandle && current.metadata?.handle
                ? current.metadata.handle
                : targetSnapshot.socialHandle,
            socialBio:
              isFetchedOrDefaultBio &&
              current.metadata?.description !== undefined
                ? (current.metadata.description ?? "")
                : targetSnapshot.socialBio,
            socialMetrics:
              isFetchedOrDefaultMetrics &&
              current.metadata?.metrics !== undefined
                ? (current.metadata.metrics ?? "")
                : targetSnapshot.socialMetrics,
            socialAvatarUrl: isFetchedOrEmptyAvatar
              ? (current.metadata?.avatarUrl ?? "")
              : targetSnapshot.socialAvatarUrl,
            socialCoverUrl: isFetchedOrEmptyCover
              ? (current.metadata?.coverUrl ?? "")
              : targetSnapshot.socialCoverUrl,
          }
        : effectiveMetadata !== targetSnapshot.metadata
          ? { ...targetSnapshot, metadata: effectiveMetadata }
          : targetSnapshot

      snapshotSocialOverridesRef.current.set(current, {
        ...userOverrodeSocialAssetsRef.current,
      })
      userOverrodeSocialAssetsRef.current.avatar = avatarWasOverridden
      userOverrodeSocialAssetsRef.current.cover = coverWasOverridden
      snapshotSocialOverridesRef.current.set(restoredState, {
        avatar: avatarWasOverridden,
        cover: coverWasOverridden,
      })

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
      setHistory((prev) =>
        enforceCombinedHistoryLimits(
          prev.past.slice(0, -1),
          prev.future,
          { incomingFuture: current }
        )
      )
    })
  }, [history.past, applyHistorySnapshot])

  const handleRedo = React.useCallback(() => {
    if (history.future.length === 0) return
    const nextState = history.future[0]!
    applyHistorySnapshot(nextState, (current) => {
      setHistory((prev) =>
        enforceCombinedHistoryLimits(
          prev.past,
          prev.future.slice(1),
          { incomingPast: current }
        )
      )
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
          const preserveMobileScreenshot =
            assetMutationTokenRef.current.mobileScreenshot !==
              startAssetTokens.mobileScreenshot ||
            Boolean(prev.customMobileScreenshotUrl)
          const preserveAvatar =
            assetMutationTokenRef.current.avatar !== startAssetTokens.avatar ||
            userOverrodeSocialAssetsRef.current.avatar
          const preserveCover =
            assetMutationTokenRef.current.cover !== startAssetTokens.cover ||
            userOverrodeSocialAssetsRef.current.cover
          return {
            ...prev,
            metadata: data,
            customScreenshotUrl: preserveScreenshot
              ? prev.customScreenshotUrl
              : "",
            customMobileScreenshotUrl: preserveMobileScreenshot
              ? prev.customMobileScreenshotUrl
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
          actionLabel: "Match brand color",
          onAction: () => {
            const getContextSnapshot = (s: StudioState) =>
              [
                s.mode,
                s.webLayout,
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
                s.bgDim,
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
                  ...(stateRef.current.bgDim === 0 ? { bgDim: 20 } : {}),
                },
                { forceHistoryStep: true }
              )
              notify(`Matched brand color (${palette.gradientVia})`)
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

    bgOperationTokenRef.current += 1
    brandPaletteSessionRef.current += 1
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

    const isDefaultDemoUrl = preservedUrl === DEFAULT_STUDIO_STATE.url

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
      socialDisplayName: preservedMetadata
        ? preservedMetadata.title ||
          (detected.platform !== "custom"
            ? detected.displayName
            : DEFAULT_STUDIO_STATE.socialDisplayName)
        : detected.platform !== "custom"
          ? detected.displayName
          : DEFAULT_STUDIO_STATE.socialDisplayName,
      socialHandle: preservedMetadata
        ? preservedMetadata.handle ||
          (detected.platform !== "custom"
            ? detected.handle
            : DEFAULT_STUDIO_STATE.socialHandle)
        : detected.platform !== "custom"
          ? detected.handle
          : DEFAULT_STUDIO_STATE.socialHandle,
      socialBio: preservedMetadata
        ? (preservedMetadata.description ?? "")
        : isDefaultDemoUrl
          ? DEFAULT_STUDIO_STATE.socialBio
          : "",
      socialMetrics: preservedMetadata
        ? (preservedMetadata.metrics ?? "")
        : isDefaultDemoUrl
          ? DEFAULT_STUDIO_STATE.socialMetrics
          : "",
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
                socialBio: preservedMetadata.description ?? "",
                socialMetrics: preservedMetadata.metrics ?? "",
                socialAvatarUrl: preservedMetadata.avatarUrl ?? "",
                socialCoverUrl:
                  patch.socialCoverUrl ?? preservedMetadata.coverUrl ?? "",
              }
            : preservedUrl === (patch.url ?? DEFAULT_STUDIO_STATE.url)
              ? {
                  socialAvatarUrl: "",
                  socialCoverUrl: patch.socialCoverUrl ?? "",
                }
              : (() => {
                  const detected = detectSocialPlatform(preservedUrl)
                  return {
                    socialDisplayName:
                      detected.platform !== "custom"
                        ? detected.displayName
                        : prev.socialDisplayName,
                    socialHandle:
                      detected.platform !== "custom"
                        ? detected.handle
                        : prev.socialHandle,
                    socialBio: "",
                    socialMetrics: "",
                    socialAvatarUrl: "",
                    socialCoverUrl: patch.socialCoverUrl ?? "",
                  }
                })()),
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
    (rawName: string): string | false => {
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
      return newPreset.id
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
      const startMode = stateRef.current.mode
      const startIsTabLayout = stateRef.current.webLayout === "tab"
      const startAssetTokens = { ...assetMutationTokenRef.current }
      const startBgToken = bgOperationTokenRef.current
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
        if (current.mode !== startMode) {
          return
        }
        if (
          startMode === "web" &&
          (current.webLayout === "tab") !== startIsTabLayout
        ) {
          return
        }

        if (current.mode === "code") {
          if (bgOperationTokenRef.current !== startBgToken) {
            return
          }
          updateState(
            {
              backgroundType: "image",
              backgroundImageUrl: dataUrl,
              unsplashPhotoId: "",
              unsplashPhotographer: "",
            },
            { forceHistoryStep: true }
          )
          notify("Applied pasted image as canvas background")
          return
        }

        if (current.mode === "web") {
          if (current.webLayout === "tab") {
            if (
              assetMutationTokenRef.current.favicon !==
              startAssetTokens.favicon
            ) {
              return
            }
            const prevFavicon = current.customFaviconUrl
            updateState(
              { customFaviconUrl: dataUrl },
              { forceHistoryStep: true }
            )
            const pasteBgOpToken = bgOperationTokenRef.current
            notify("Pasted image as header icon", {
              actionLabel: "Use as Background",
              onAction: () => {
                const latest = stateRef.current
                if (
                  !isCurrentPaste() ||
                  bgOperationTokenRef.current !== pasteBgOpToken ||
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
            if (
              assetMutationTokenRef.current.screenshot !==
              startAssetTokens.screenshot
            ) {
              return
            }
            const prevScreenshot = current.customScreenshotUrl
            updateState(
              { customScreenshotUrl: dataUrl },
              { forceHistoryStep: true }
            )
            const pasteBgOpToken = bgOperationTokenRef.current
            notify("Pasted image as browser screenshot", {
              actionLabel: "Use as Background",
              onAction: () => {
                const latest = stateRef.current
                if (
                  !isCurrentPaste() ||
                  bgOperationTokenRef.current !== pasteBgOpToken ||
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
          if (
            assetMutationTokenRef.current.cover !== startAssetTokens.cover
          ) {
            return
          }
          const prevCover = current.socialCoverUrl
          const prevCoverWasOverride = userOverrodeSocialAssetsRef.current.cover
          updateState({ socialCoverUrl: dataUrl }, { forceHistoryStep: true })
          const pasteAvatarToken = assetMutationTokenRef.current.avatar
          const pasteCoverToken = assetMutationTokenRef.current.cover
          notify("Pasted image as social cover", {
            actionLabel: "Use as Avatar",
            onAction: () => {
              const latest = stateRef.current
              if (
                !isCurrentPaste() ||
                assetMutationTokenRef.current.avatar !== pasteAvatarToken ||
                assetMutationTokenRef.current.cover !== pasteCoverToken ||
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
              userOverrodeSocialAssetsRef.current.cover = prevCoverWasOverride
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
            getBackgroundResetToken={getBackgroundResetToken}
            getAssetMutationToken={getAssetMutationToken}
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
          getUploadResetToken={getBackgroundResetToken}
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

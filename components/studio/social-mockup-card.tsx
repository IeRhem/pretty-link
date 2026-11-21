"use client"

import * as React from "react"
import {
  IconArrowRight,
  IconArrowUpRight,
  IconNotes,
  IconRosetteDiscountCheckFilled,
  IconStarFilled,
  IconUserFilled,
} from "@tabler/icons-react"
import { QrCodeSvg } from "@/components/studio/qr-code-svg"
import { SocialPlatformIcon } from "@/components/studio/social-platform-icon"
import { SOCIAL_PLATFORMS } from "@/lib/social-platforms"
import type { StudioState } from "@/lib/studio-types"
import { formatDisplayUrl, normalizeUrl, toImageProxyUrl } from "@/lib/url-utils"
import { cn } from "@/lib/utils"

export function parseSocialStats(
  metrics: string
): Array<{ value: string; label: string }> {
  if (!metrics || !metrics.trim()) return []

  const parts = metrics
    .split(/[·|,]/)
    .map((s) => s.trim())
    .filter(Boolean)

  return parts.slice(0, 3).map((part) => {
    const tokens = part.split(/\s+/).filter(Boolean)
    if (tokens.length === 1) {
      return {
        value: tokens[0]!,
        label: "Metric",
      }
    }
    return {
      value: tokens[0]!,
      label: tokens.slice(1).join(" "),
    }
  })
}

function getStatIcon(label: string) {
  const lower = label.toLowerCase()
  if (lower.includes("star") || lower.includes("rating")) {
    return IconStarFilled
  }
  if (
    lower.includes("post") ||
    lower.includes("tweet") ||
    lower.includes("repo") ||
    lower.includes("fork") ||
    lower.includes("shot") ||
    lower.includes("video")
  ) {
    return IconNotes
  }
  return IconUserFilled
}

const FALLBACK_COVER_STYLE: React.CSSProperties = {
  backgroundImage:
    "radial-gradient(at 18% 22%, #a7f3d0 0%, transparent 52%), radial-gradient(at 82% 74%, #065f46 0%, transparent 58%), linear-gradient(135deg, #047857 0%, #22c55e 48%, #0f766e 100%)",
}

export function SocialMockupCard({
  state,
  logicalWidth,
  logicalHeight,
  previewGeneration = 0,
}: {
  state: StudioState
  logicalWidth: number
  logicalHeight: number
  previewGeneration?: number
}) {
  const platform = SOCIAL_PLATFORMS[state.socialPlatform] ?? SOCIAL_PLATFORMS.custom
  const minDim = Math.min(logicalWidth, logicalHeight)
  const scaleFactor = minDim / 500
  const userScale = state.frameScale / 100

  const rawAvatarSrc = state.socialAvatarUrl || state.metadata?.avatarUrl || ""
  const rawCoverSrc = state.socialCoverUrl || state.metadata?.coverUrl || ""
  const generationKey = `${previewGeneration}|${state.metadata?.fetchedAt ?? ""}|${state.url}|${rawAvatarSrc}|${rawCoverSrc}`

  const [failedState, setFailedState] = React.useState<{
    generationKey: string
    urls: string[]
  }>({ generationKey, urls: [] })

  const activeFailedUrls =
    failedState.generationKey === generationKey ? failedState.urls : []

  const markFailed = (src: string) => {
    setFailedState((prev) => {
      const currentUrls = prev.generationKey === generationKey ? prev.urls : []
      if (currentUrls.includes(src)) {
        return prev.generationKey === generationKey
          ? prev
          : { generationKey, urls: currentUrls }
      }
      return {
        generationKey,
        urls: [...currentUrls, src],
      }
    })
  }

  const resolveImageWithProxyFallback = (rawSrc: string): string => {
    if (!rawSrc) return ""
    if (!activeFailedUrls.includes(rawSrc)) return rawSrc
    if (rawSrc.startsWith("/api/image-proxy?")) {
      const direct = new URLSearchParams(rawSrc.split("?")[1] ?? "").get("url")
      if (direct && !activeFailedUrls.includes(direct)) return direct
    } else if (/^https?:\/\//i.test(rawSrc)) {
      const proxied = toImageProxyUrl(rawSrc)
      if (proxied && !activeFailedUrls.includes(proxied)) return proxied
    }
    return ""
  }

  const avatarSrc = resolveImageWithProxyFallback(rawAvatarSrc)
  const coverSrc = resolveImageWithProxyFallback(rawCoverSrc)

  const isDarkSurface =
    state.socialCardTheme === "dark" ||
    (state.socialCardTheme === "glass" && state.socialCardStyle !== "elevated")
  const isLightSurface = !isDarkSurface

  const shadowAlpha = 0.16 + (state.frameShadow / 100) * 0.4
  const shadowBlur = Math.round(40 * scaleFactor * (state.frameShadow / 100))
  const shadowY = Math.round(18 * scaleFactor * (state.frameShadow / 100))

  const targetUrl = normalizeUrl(state.url) || "https://www.lerhem.space"
  const displayUrl = formatDisplayUrl(state.url)
  const initial = (state.socialDisplayName || "O").charAt(0).toUpperCase()
  const stats = React.useMemo(
    () => parseSocialStats(state.socialMetrics),
    [state.socialMetrics]
  )

  const renderAvatar = (sizeClass: string, ringClass: string) => (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-heading font-bold text-white shadow-md",
        sizeClass,
        ringClass
      )}
      style={{
        background: avatarSrc ? "#FEFCE8" : platform.accentGradient,
      }}
    >
      {avatarSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${generationKey}:${avatarSrc}`}
          src={avatarSrc}
          alt={state.socialDisplayName}
          referrerPolicy="no-referrer"
          onError={() => markFailed(avatarSrc)}
          className="size-full object-cover"
        />
      ) : (
        <span className="text-xl">{initial}</span>
      )}
    </div>
  )

  const renderCoverBackdrop = (className?: string) => (
    <>
      {coverSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${generationKey}:${coverSrc}`}
          src={coverSrc}
          alt="Account cover"
          referrerPolicy="no-referrer"
          onError={() => markFailed(coverSrc)}
          className={cn("size-full object-cover", className)}
        />
      ) : (
        <div
          style={FALLBACK_COVER_STYLE}
          className={cn("size-full", className)}
        />
      )}
    </>
  )

  if (state.socialCardStyle === "pill") {
    return (
      <div className="flex size-full items-center justify-center p-6">
        <div
          style={{
            transform: `scale(${userScale})`,
            boxShadow:
              state.frameShadow > 0
                ? `0 ${shadowY}px ${shadowBlur}px rgba(0, 0, 0, ${shadowAlpha})`
                : "none",
          }}
          className={cn(
            "flex w-[88%] items-center gap-4 rounded-full p-3.5 pr-5 transition-transform",
            isLightSurface
              ? "bg-white/92 text-zinc-950 ring-1 ring-black/10 backdrop-blur-xl"
              : "bg-zinc-950/82 text-zinc-50 ring-1 ring-white/15 backdrop-blur-xl"
          )}
        >
          {renderAvatar("size-16", "ring-2 ring-white/80")}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-heading text-lg font-bold tracking-tight">
                {state.socialDisplayName || "Olivia Rhye"}
              </span>
              {state.socialVerified && (
                <IconRosetteDiscountCheckFilled
                  className="size-4 shrink-0"
                  style={{ color: platform.accent }}
                />
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs opacity-70">
              <SocialPlatformIcon
                platform={platform.id}
                className="size-3.5 shrink-0"
              />
              <span className="truncate">
                {state.socialHandle || "@Oliviar_"} · {platform.shortLabel}
              </span>
            </div>
          </div>

          {state.socialShowQr ? (
            <QrCodeSvg
              value={targetUrl}
              className="size-14 shrink-0 rounded-full p-2"
            />
          ) : (
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-3.5 py-2 text-xs font-semibold text-white"
              style={{ backgroundColor: platform.accent }}
            >
              {state.socialCtaLabel || platform.defaultCta}
              <IconArrowUpRight className="size-3.5" />
            </span>
          )}
        </div>
      </div>
    )
  }

  // Full-Bleed Cover Card (Right reference card)
  if (state.socialCardStyle === "glass") {
    return (
      <div className="flex size-full items-center justify-center p-4">
        <div
          style={{
            transform: `scale(${userScale})`,
            boxShadow:
              state.frameShadow > 0
                ? `0 ${shadowY}px ${shadowBlur}px rgba(0, 0, 0, ${shadowAlpha})`
                : "none",
          }}
          className="relative w-[82%] max-w-90 overflow-hidden rounded-[28px] text-white ring-1 ring-white/20 transition-transform"
        >
          {/* Full cover image / mesh gradient behind card */}
          <div className="absolute inset-0">
            {renderCoverBackdrop()}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.26) 44%, rgba(0,0,0,0.64) 100%)",
              }}
            />
          </div>

          {/* Top-left subtle platform pill & optional top-right QR */}
          <div className="pointer-events-none absolute inset-x-3.5 top-3.5 z-10 flex items-start justify-between">
            <span className="inline-flex items-center gap-1 rounded-full bg-black/25 px-2.5 py-1 text-[10px] font-medium text-white/90 ring-1 ring-white/20 backdrop-blur-md">
              <SocialPlatformIcon platform={platform.id} className="size-3" />
              {platform.shortLabel}
            </span>
            {state.socialShowQr && (
              <QrCodeSvg
                value={targetUrl}
                className="size-11 shrink-0 rounded-xl p-1"
              />
            )}
          </div>

          {/* Foreground profile content */}
          <div className="relative z-10 flex flex-col p-5 pt-14">
            {renderAvatar("size-[72px]", "ring-[3px] ring-white/95")}

            <div className="mt-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h2 className="truncate font-heading text-[17px] leading-tight font-bold tracking-tight text-white">
                    {state.socialDisplayName || "Olivia Rhye"}
                  </h2>
                  {state.socialVerified && (
                    <IconRosetteDiscountCheckFilled className="size-4 shrink-0 text-white" />
                  )}
                </div>
                <p className="truncate text-xs font-medium text-white/80">
                  {state.socialHandle || "@Oliviar_"}
                </p>
              </div>
            </div>

            {state.socialBio && (
              <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-white/90">
                {state.socialBio}
              </p>
            )}

            {stats.length > 0 && (
              <div
                className={cn(
                  "mt-3.5 grid gap-2 text-center",
                  stats.length === 1
                    ? "grid-cols-1"
                    : stats.length === 2
                      ? "grid-cols-2"
                      : "grid-cols-3"
                )}
              >
                {stats.map((stat, idx) => {
                  const StatIcon = getStatIcon(stat.label)
                  return (
                    <div key={`${stat.label}-${idx}`} className="min-w-0">
                      <div className="flex items-center justify-center gap-1 text-[15px] font-bold text-white tabular-nums">
                        <StatIcon className="size-3.5 shrink-0 opacity-95" />
                        <span className="truncate">{stat.value}</span>
                      </div>
                      <div className="mt-0.5 truncate text-[11px] font-medium text-white/80">
                        {stat.label}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="relative mt-4 flex h-11 w-full items-center justify-center rounded-full bg-white px-4 text-zinc-950 shadow-md">
              <span className="absolute left-1.5 flex size-8 items-center justify-center rounded-full bg-zinc-950 text-white">
                <IconArrowRight className="size-4" stroke={2} />
              </span>
              <span className="truncate px-8 text-xs font-semibold">
                {state.socialCtaLabel || "Get in Touch"}
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Split Cover Banner Card (Left reference card — elevated / bento / browser)
  return (
    <div className="flex size-full items-center justify-center p-4">
      <div
        style={{
          transform: `scale(${userScale})`,
          boxShadow:
            state.frameShadow > 0
              ? `0 ${shadowY}px ${shadowBlur}px rgba(0, 0, 0, ${shadowAlpha})`
              : "none",
        }}
        className={cn(
          "w-[82%] max-w-90 overflow-hidden rounded-[28px] p-3.5 transition-transform",
          isLightSurface
            ? "bg-white text-zinc-950 ring-1 ring-black/8"
            : "bg-[#111115] text-zinc-50 ring-1 ring-white/12"
        )}
      >
        {state.socialCardStyle === "browser" && (
          <div
            className={cn(
              "-mx-3.5 -mt-3.5 mb-3 flex items-center justify-between border-b px-4 py-2",
              isLightSurface
                ? "border-black/6 bg-black/3"
                : "border-white/8 bg-white/4"
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-[#FF5F57]" />
              <span className="size-2.5 rounded-full bg-[#FEBC2E]" />
              <span className="size-2.5 rounded-full bg-[#28C840]" />
            </div>
            <span className="max-w-[65%] truncate font-mono text-[10px] opacity-60">
              {displayUrl}
            </span>
            <span className="w-6" />
          </div>
        )}

        {/* Inset Cover Photo Banner */}
        <div className="relative h-27 w-full overflow-hidden rounded-[20px]">
          {renderCoverBackdrop()}

          <div className="pointer-events-none absolute top-2.5 right-2.5 flex items-center gap-1.5">
            {state.socialShowQr ? (
              <QrCodeSvg
                value={targetUrl}
                className="size-11 shrink-0 rounded-xl p-1"
              />
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-medium text-white ring-1 ring-white/20 backdrop-blur-md">
                <SocialPlatformIcon platform={platform.id} className="size-3" />
                {platform.shortLabel}
              </span>
            )}
          </div>
        </div>

        {/* Overlapping Circular Avatar */}
        <div className="relative z-10 -mt-9 ml-3 w-fit">
          {renderAvatar(
            "size-[68px]",
            isLightSurface ? "ring-4 ring-white" : "ring-4 ring-[#111115]"
          )}
        </div>

        {/* Name + Handle */}
        <div className="mt-2 px-1.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate font-heading text-[17px] leading-tight font-bold tracking-tight">
                {state.socialDisplayName || "Olivia Rhye"}
              </h2>
              {state.socialVerified && (
                <IconRosetteDiscountCheckFilled
                  className="size-4 shrink-0"
                  style={{ color: platform.accent }}
                />
              )}
            </div>
            <p className="truncate text-xs font-medium opacity-55">
              {state.socialHandle || "@Oliviar_"}
            </p>
          </div>
        </div>

        {/* Account Description */}
        {state.socialBio && (
          <p className="mt-2 line-clamp-2 px-1.5 text-xs leading-relaxed opacity-75">
            {state.socialBio}
          </p>
        )}

        {/* Metrics Row (only when metrics exist) */}
        {stats.length > 0 && (
          <>
            <div
              className={cn(
                "mx-1.5 my-2.5 h-px",
                isLightSurface ? "bg-zinc-200/80" : "bg-white/10"
              )}
            />

            <div
              className={cn(
                "grid gap-2 px-1 text-center",
                stats.length === 1
                  ? "grid-cols-1"
                  : stats.length === 2
                    ? "grid-cols-2"
                    : "grid-cols-3"
              )}
            >
              {stats.map((stat, idx) => {
                const StatIcon = getStatIcon(stat.label)
                return (
                  <div
                    key={`${stat.label}-${idx}`}
                    className={cn(
                      "min-w-0",
                      state.socialCardStyle === "bento" &&
                        (isLightSurface
                          ? "rounded-xl bg-zinc-100/80 py-1.5"
                          : "rounded-xl bg-white/5 py-1.5")
                    )}
                  >
                    <div className="flex items-center justify-center gap-1 text-[15px] font-bold tabular-nums">
                      <StatIcon className="size-3.5 shrink-0" />
                      <span className="truncate">{stat.value}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[11px] font-medium opacity-55">
                      {stat.label}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Full-Width Bottom Pill CTA Bar */}
        <div
          style={
            isLightSurface
              ? {
                  background:
                    "linear-gradient(90deg, #09090B 0%, #27272A 58%, #52525B 100%)",
                }
              : undefined
          }
          className={cn(
            "relative mt-3.5 flex h-11 w-full items-center justify-center rounded-full px-4 shadow-sm",
            isLightSurface ? "text-white" : "bg-white text-zinc-950"
          )}
        >
          <span
            className={cn(
              "absolute left-1.5 flex size-8 items-center justify-center rounded-full",
              isLightSurface
                ? "bg-white text-zinc-950"
                : "bg-zinc-950 text-white"
            )}
          >
            <IconArrowRight className="size-4" stroke={2} />
          </span>
          <span className="truncate px-8 text-xs font-semibold">
            {state.socialCtaLabel || "Get in Touch"}
          </span>
        </div>
      </div>
    </div>
  )
}

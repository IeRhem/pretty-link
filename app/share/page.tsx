import { Suspense } from "react"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { ShareView } from "@/components/studio/share-view"
import { Skeleton } from "@/components/ui/skeleton"
import { DEFAULT_STUDIO_STATE } from "@/lib/studio-types"
import {
  decodeShareState,
  formatDisplayUrl,
  resolvePublicAppOrigin,
} from "@/lib/url-utils"

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ d?: string | string[] }>
}): Promise<Metadata> {
  const [resolved, reqHeaders] = await Promise.all([searchParams, headers()])
  const rawD =
    typeof resolved.d === "string"
      ? resolved.d
      : Array.isArray(resolved.d)
        ? (resolved.d[0] ?? "")
        : ""
  const decoded = rawD ? decodeShareState(rawD) : null
  const state = decoded
    ? { ...DEFAULT_STUDIO_STATE, ...decoded }
    : DEFAULT_STUDIO_STATE

  const publicOrigin = resolvePublicAppOrigin(
    reqHeaders.get("x-forwarded-host") ?? reqHeaders.get("host"),
    reqHeaders.get("x-forwarded-proto")
  )
  const displayUrl = formatDisplayUrl(state.url)
  const title =
    state.mode === "social"
      ? `${state.socialDisplayName || displayUrl} (${state.socialHandle || displayUrl}) — PrettyLink`
      : `${state.tabTitle.trim() || displayUrl} — PrettyLink Showcase`
  const description =
    state.mode === "social" && state.socialBio.trim()
      ? state.socialBio.trim()
      : `Interactive PrettyLink visual card for ${displayUrl}.`
  const ogImageUrl = rawD
    ? `${publicOrigin}/api/og?d=${encodeURIComponent(rawD)}`
    : `${publicOrigin}/api/og`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  }
}

export default function SharePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background p-8">
          <Skeleton className="size-[460px] rounded-3xl" />
        </div>
      }
    >
      <ShareView />
    </Suspense>
  )
}

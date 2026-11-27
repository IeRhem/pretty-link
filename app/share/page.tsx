import { Suspense } from "react"
import type { Metadata } from "next"
import { ShareView } from "@/components/studio/share-view"
import { Skeleton } from "@/components/ui/skeleton"
import { DEFAULT_STUDIO_STATE } from "@/lib/studio-types"
import { decodeShareState, formatDisplayUrl } from "@/lib/url-utils"

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ d?: string | string[] }>
}): Promise<Metadata> {
  const resolved = await searchParams
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
    ? `/api/og?d=${encodeURIComponent(rawD)}`
    : "/api/og"

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

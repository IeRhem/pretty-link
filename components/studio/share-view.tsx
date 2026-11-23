"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  IconArrowUpRight,
  IconDownload,
  IconLink,
  IconSparkles,
} from "@tabler/icons-react"
import { MockupFrame } from "@/components/studio/mockup-frame"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { downloadStudioImage } from "@/lib/export-canvas"
import { DEFAULT_STUDIO_STATE, type StudioState } from "@/lib/studio-types"
import {
  decodeShareState,
  encodeShareState,
  formatDisplayUrl,
  validatePublicUrl,
} from "@/lib/url-utils"

export function ShareView() {
  const searchParams = useSearchParams()
  const rawData = searchParams.get("d") ?? ""
  const [downloading, setDownloading] = React.useState(false)
  const [downloadError, setDownloadError] = React.useState<string | null>(null)

  const state = React.useMemo<StudioState>(() => {
    const decoded = decodeShareState(rawData)
    if (!decoded) return DEFAULT_STUDIO_STATE
    return {
      ...DEFAULT_STUDIO_STATE,
      ...decoded,
      metadata: null,
    }
  }, [rawData])

  const urlCheck = React.useMemo(
    () => validatePublicUrl(state.url),
    [state.url]
  )
  const safeHref = urlCheck.ok ? urlCheck.url.toString() : null
  const remixHref = `/?remix=${encodeURIComponent(rawData || encodeShareState(state))}`

  const handleDownload = async () => {
    setDownloading(true)
    setDownloadError(null)
    try {
      await downloadStudioImage(state, { format: "png", scale: 2 })
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : "Failed to export image."
      )
    } finally {
      setDownloading(false)
    }
  }

  return (
    <main className="bg-studio-grid flex min-h-dvh flex-col items-center justify-between bg-background p-3 sm:p-8">
      <header className="flex w-full max-w-4xl items-center justify-between gap-2">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-xl border border-border/80 bg-card/90 px-3 py-1.5 shadow-2xs"
        >
          <span className="flex size-6 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <IconLink className="size-3.5" stroke={2.2} />
          </span>
          <span className="font-heading text-sm font-semibold">PrettyLink</span>
        </Link>

        <Badge
          variant="outline"
          className="min-w-0 max-w-[55%] truncate font-mono text-xs text-muted-foreground"
        >
          {formatDisplayUrl(state.url)}
        </Badge>
      </header>

      <section className="my-4 flex min-h-[280px] w-full max-w-3xl flex-1 items-center justify-center sm:my-6">
        <MockupFrame state={state} maxWidthPx={580} maxHeightPx={560} />
      </section>

      {downloadError && (
        <p
          role="alert"
          className="mb-3 max-w-xl rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2 text-center text-xs text-destructive"
        >
          {downloadError}
        </p>
      )}

      <footer className="flex max-w-full flex-wrap items-center justify-center gap-2 rounded-2xl border border-border/80 bg-card/90 p-2.5 shadow-lg backdrop-blur-md sm:gap-3">
        {safeHref ? (
          <a
            href={safeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85"
          >
            Visit Link
            <IconArrowUpRight className="size-4" />
          </a>
        ) : (
          <Button variant="secondary" disabled>
            Invalid Target URL
          </Button>
        )}

        <Button
          type="button"
          variant="secondary"
          size="lg"
          disabled={downloading}
          onClick={handleDownload}
          className="rounded-xl"
        >
          {downloading ? <Spinner /> : <IconDownload />}
          Download PNG
        </Button>

        <Link
          href={remixHref}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border bg-background/60 px-4 text-sm font-medium transition-colors hover:bg-muted"
        >
          <IconSparkles className="size-4" />
          Remix in Studio
        </Link>
      </footer>
    </main>
  )
}

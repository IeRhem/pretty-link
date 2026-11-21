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
    try {
      await downloadStudioImage(state, { format: "png", scale: 2 })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <main className="bg-studio-grid flex min-h-screen flex-col items-center justify-between bg-background p-4 sm:p-8">
      <header className="flex w-full max-w-4xl items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-xl border border-border/80 bg-card/90 px-3 py-1.5 shadow-2xs"
        >
          <span className="flex size-6 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <IconLink className="size-3.5" stroke={2.2} />
          </span>
          <span className="font-heading text-sm font-semibold">PrettyLink</span>
        </Link>

        <Badge variant="outline" className="font-mono text-xs text-muted-foreground">
          {formatDisplayUrl(state.url)}
        </Badge>
      </header>

      <section className="my-6 flex w-full max-w-3xl flex-1 items-center justify-center">
        <MockupFrame state={state} maxWidthPx={580} maxHeightPx={560} />
      </section>

      <footer className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-border/80 bg-card/90 p-2.5 shadow-lg backdrop-blur-md">
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

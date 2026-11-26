"use client"

import * as React from "react"
import {
  IconCheck,
  IconCopy,
  IconDownload,
  IconFileZip,
  IconLink,
} from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import {
  copyStudioImageToClipboard,
  downloadBatchSocialKitZip,
  downloadStudioImage,
} from "@/lib/export-canvas"
import {
  ASPECT_RATIOS,
  DEFAULT_BATCH_RATIO_IDS,
  resolveAspectDimensions,
} from "@/lib/presets"
import { getQrByteLength, QR_MAX_BYTE_LENGTH } from "@/lib/qr"
import type {
  ExportFormat,
  ExportScale,
  StudioState,
} from "@/lib/studio-types"
import {
  encodeShareState,
  formatDisplayUrl,
  normalizeUrl,
  SHARE_STATE_MAX_LENGTH,
} from "@/lib/url-utils"
import { cn } from "@/lib/utils"

export function ExportDialog({
  open,
  onOpenChange,
  state,
  onNotify,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  state: StudioState
  onNotify: (msg: string) => void
}) {
  const [format, setFormat] = React.useState<ExportFormat>("png")
  const [scale, setScale] = React.useState<ExportScale>(2)
  const [filename, setFilename] = React.useState("")
  const [busy, setBusy] = React.useState<"download" | "copy" | "batch" | null>(
    null
  )
  const [copiedLink, setCopiedLink] = React.useState(false)
  const [batchRatioIds, setBatchRatioIds] = React.useState<string[]>(
    DEFAULT_BATCH_RATIO_IDS
  )
  const [batchProgress, setBatchProgress] = React.useState<{
    done: number
    total: number
  } | null>(null)

  const batchableRatios = React.useMemo(
    () => ASPECT_RATIOS.filter((r) => r.id !== "custom"),
    []
  )

  const toggleBatchRatio = (id: string) => {
    setBatchRatioIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const { width, height } = resolveAspectDimensions(state)
  const qrEnabled = state.mode === "web" ? state.webShowQr : state.socialShowQr
  const qrByteLength = getQrByteLength(
    normalizeUrl(state.url) || "https://www.lerhem.space"
  )
  const qrExceedsCapacity = qrEnabled && qrByteLength > QR_MAX_BYTE_LENGTH
  const suggestedName = React.useMemo(() => {
    const clean = formatDisplayUrl(state.url)
      .replace(/[^a-z0-9.-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32)
    return `prettylink-${clean || "card"}`
  }, [state.url])

  const handleDownload = async () => {
    setBusy("download")
    try {
      await downloadStudioImage(state, {
        format,
        scale,
        filename: filename.trim() || suggestedName,
      })
      onNotify(`Exported ${width * scale}×${height * scale} ${format.toUpperCase()}`)
      onOpenChange(false)
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Failed to export image")
    } finally {
      setBusy(null)
    }
  }

  const handleCopyPng = async () => {
    setBusy("copy")
    try {
      await copyStudioImageToClipboard(state, scale)
      onNotify(`Copied ${width * scale}×${height * scale} PNG to clipboard`)
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Clipboard copy failed")
    } finally {
      setBusy(null)
    }
  }

  const handleBatchDownload = async () => {
    if (batchRatioIds.length === 0) {
      onNotify("Select at least one aspect ratio for the Social Kit ZIP")
      return
    }
    setBusy("batch")
    setBatchProgress({ done: 0, total: batchRatioIds.length })
    try {
      const count = await downloadBatchSocialKitZip(state, {
        ratioIds: batchRatioIds,
        format,
        scale,
        baseFilename: filename.trim() || suggestedName,
        onProgress: (done, total) => setBatchProgress({ done, total }),
      })
      onNotify(
        `Exported Social Kit ZIP (${count} ${format.toUpperCase()} images at ${scale}×)`
      )
      onOpenChange(false)
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : "Failed to export Social Kit ZIP"
      )
    } finally {
      setBusy(null)
      setBatchProgress(null)
    }
  }

  const handleCopyShareLink = async () => {
    const encoded = encodeShareState(state)
    if (encoded.length > SHARE_STATE_MAX_LENGTH) {
      onNotify(
        "Share link is too large. Shorten text or remove long custom URLs to share."
      )
      return
    }
    try {
      const shareUrl = `${window.location.origin}/share?d=${encoded}`
      await navigator.clipboard.writeText(shareUrl)
      setCopiedLink(true)
      onNotify("Copied shareable PrettyLink page URL")
      setTimeout(() => setCopiedLink(false), 1800)
    } catch {
      onNotify("Could not copy share link to clipboard")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Export PrettyLink</DialogTitle>
            <Badge variant="secondary" className="font-mono text-[11px]">
              {width * scale} × {height * scale}
            </Badge>
          </div>
          <DialogDescription>
            Render a high-DPI raster image or copy a shareable PrettyLink destination page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">File Format</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["png", "jpeg", "webp"] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setFormat(fmt)}
                  className={cn(
                    "rounded-xl border py-2 text-xs font-semibold uppercase transition-colors",
                    format === fmt
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border bg-muted/30 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {fmt}
                </button>
              ))}
            </div>
            {state.backgroundType === "none" && format === "jpeg" && (
              <p className="text-[11px] text-muted-foreground">
                Note: JPEG does not support transparency; choose PNG or WebP to keep a transparent background.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Resolution Scale</Label>
            <div className="grid grid-cols-3 gap-2">
              {([1, 2, 3] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScale(s)}
                  className={cn(
                    "flex flex-col items-center rounded-xl border py-2 text-xs transition-colors",
                    scale === s
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border bg-muted/30 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="font-semibold">{s}×</span>
                  <span className="font-mono text-[10px] opacity-70">
                    {width * s}×{height * s}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="export-filename" className="text-xs text-muted-foreground">
                Filename
              </Label>
              <button
                type="button"
                onClick={() => {
                  const now = new Date()
                  const pad = (n: number) => String(n).padStart(2, "0")
                  const d = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
                  const t = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
                  setFilename(`Screenshot_${d}_${t}_Chrome`)
                }}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                Use Screenshot_…_Chrome name
              </button>
            </div>
            <Input
              id="export-filename"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder={suggestedName}
              className="h-9 font-mono text-xs"
            />
          </div>

          <div className="space-y-2 rounded-xl border border-border/80 bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <IconFileZip
                  className="size-3.5 text-primary"
                  aria-hidden="true"
                />
                <Label className="text-xs font-semibold text-foreground">
                  Batch Social Kit (.zip)
                </Label>
                <Badge variant="outline" className="px-1.5 py-0 font-mono text-[10px]">
                  {batchRatioIds.length}/{batchableRatios.length}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => setBatchRatioIds(DEFAULT_BATCH_RATIO_IDS)}
                  className="font-medium text-muted-foreground hover:text-foreground"
                >
                  Core 5
                </button>
                <span className="text-border">·</span>
                <button
                  type="button"
                  onClick={() =>
                    setBatchRatioIds(batchableRatios.map((r) => r.id))
                  }
                  className="font-medium text-muted-foreground hover:text-foreground"
                >
                  All {batchableRatios.length}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {batchableRatios.map((ratio) => {
                const selected = batchRatioIds.includes(ratio.id)
                return (
                  <button
                    key={ratio.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleBatchRatio(ratio.id)}
                    className={cn(
                      "flex flex-col items-start rounded-lg border px-2 py-1.5 text-left transition-colors",
                      selected
                        ? "border-primary/70 bg-primary/15 text-foreground"
                        : "border-border/70 bg-background/50 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="w-full truncate text-[11px] font-medium">
                      {ratio.label}
                    </span>
                    <span className="font-mono text-[10px] opacity-75">
                      {ratio.ratioLabel} · {ratio.width * scale}×
                      {ratio.height * scale}
                    </span>
                  </button>
                )
              })}
            </div>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy !== null || batchRatioIds.length === 0}
              onClick={handleBatchDownload}
              className="mt-1 w-full font-semibold"
            >
              {busy === "batch" ? <Spinner /> : <IconFileZip />}
              {busy === "batch" && batchProgress
                ? `Rendering ${batchProgress.done}/${batchProgress.total}…`
                : `Download Social Kit (.zip · ${batchRatioIds.length} ratios)`}
            </Button>
          </div>

          {qrExceedsCapacity && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              URL is {qrByteLength} bytes (max {QR_MAX_BYTE_LENGTH} bytes for QR codes). Shorten the URL or disable the QR overlay to export.
            </p>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            type="button"
            size="lg"
            className="w-full font-semibold"
            disabled={busy !== null}
            onClick={handleDownload}
          >
            {busy === "download" ? <Spinner /> : <IconDownload />}
            Download {format.toUpperCase()}
          </Button>

          <div className="grid w-full grid-cols-2 gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy !== null}
              onClick={handleCopyPng}
            >
              {busy === "copy" ? <Spinner /> : <IconCopy />}
              Copy PNG
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleCopyShareLink}
            >
              {copiedLink ? <IconCheck /> : <IconLink />}
              Share Page URL
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

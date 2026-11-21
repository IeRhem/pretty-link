"use client"

import * as React from "react"
import {
  IconCheck,
  IconCopy,
  IconDownload,
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
  downloadStudioImage,
} from "@/lib/export-canvas"
import { resolveAspectDimensions } from "@/lib/presets"
import type {
  ExportFormat,
  ExportScale,
  StudioState,
} from "@/lib/studio-types"
import { encodeShareState, formatDisplayUrl } from "@/lib/url-utils"
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
  const [busy, setBusy] = React.useState<"download" | "copy" | null>(null)
  const [copiedLink, setCopiedLink] = React.useState(false)

  const { width, height } = resolveAspectDimensions(state)
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

  const handleCopyShareLink = async () => {
    const encoded = encodeShareState(state)
    const shareUrl = `${window.location.origin}/share?d=${encoded}`
    await navigator.clipboard.writeText(shareUrl)
    setCopiedLink(true)
    onNotify("Copied shareable PrettyLink page URL")
    setTimeout(() => setCopiedLink(false), 1800)
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
            <Label htmlFor="export-filename" className="text-xs text-muted-foreground">
              Filename
            </Label>
            <Input
              id="export-filename"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder={suggestedName}
              className="h-9 font-mono text-xs"
            />
          </div>
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

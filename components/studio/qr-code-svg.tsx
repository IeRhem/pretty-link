"use client"

import * as React from "react"
import {
  generateQrMatrix,
  getQrByteLength,
  QR_MAX_BYTE_LENGTH,
} from "@/lib/qr"
import { cn } from "@/lib/utils"

export function QrCodeSvg({
  value,
  className,
  darkColor = "#09090B",
}: {
  value: string
  className?: string
  darkColor?: string
}) {
  const exceedsCapacity = getQrByteLength(value) > QR_MAX_BYTE_LENGTH
  const matrix = React.useMemo(
    () => (exceedsCapacity ? null : generateQrMatrix(value)),
    [exceedsCapacity, value]
  )

  if (!matrix) {
    return (
      <div
        role="img"
        aria-label={`QR code unavailable: URL exceeds ${QR_MAX_BYTE_LENGTH}-byte limit`}
        title={`URL is too long for QR code (max ${QR_MAX_BYTE_LENGTH} bytes)`}
        className={cn(
          "inline-flex flex-col items-center justify-center rounded-xl bg-white p-1.5 text-center text-[8px] leading-tight font-semibold text-zinc-600 shadow-sm ring-1 ring-black/10",
          className
        )}
      >
        <span>QR</span>
        <span>&gt;{QR_MAX_BYTE_LENGTH}B</span>
      </div>
    )
  }

  const size = matrix.length
  const quiet = 2
  const viewBoxSize = size + quiet * 2

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-xl bg-white p-1.5 shadow-sm ring-1 ring-black/10",
        className
      )}
    >
      <svg
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        className="size-full"
        shapeRendering="crispEdges"
        aria-label={`QR code for ${value}`}
        role="img"
      >
        <rect width={viewBoxSize} height={viewBoxSize} fill="#FFFFFF" />
        {matrix.map((row, r) =>
          row.map((cell, c) =>
            cell ? (
              <rect
                key={`${r}-${c}`}
                x={c + quiet}
                y={r + quiet}
                width={1}
                height={1}
                fill={darkColor}
              />
            ) : null
          )
        )}
      </svg>
    </div>
  )
}

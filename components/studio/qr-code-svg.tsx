"use client"

import * as React from "react"
import { generateQrMatrix } from "@/lib/qr"
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
  const matrix = React.useMemo(() => generateQrMatrix(value), [value])
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

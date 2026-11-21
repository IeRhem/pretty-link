import { parseSocialStats } from "@/components/studio/social-mockup-card"
import { resolveAspectDimensions } from "@/lib/presets"
import { generateQrMatrix } from "@/lib/qr"
import { SOCIAL_PLATFORMS } from "@/lib/social-platforms"
import type {
  BorderStyle,
  ExportFormat,
  ExportScale,
  StudioState,
} from "@/lib/studio-types"
import { formatDisplayUrl, normalizeUrl, toImageProxyUrl } from "@/lib/url-utils"

export interface ExportOptions {
  format: ExportFormat
  scale: ExportScale
  filename?: string
}

export function getOuterBorderRadius(
  borderStyle: BorderStyle,
  width: number,
  height: number
): number {
  const minDim = Math.min(width, height)
  if (borderStyle === "sharp") return 0
  if (borderStyle === "curved") return Math.round(minDim * 0.036)
  return Math.round(minDim * 0.064)
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | [number, number, number, number]
) {
  const maxR = Math.max(0, Math.min(w / 2, h / 2))
  const raw = Array.isArray(r) ? r : [r, r, r, r]
  const [tl, tr, br, bl] = raw.map((val) =>
    Math.max(0, Math.min(maxR, val))
  ) as [number, number, number, number]

  ctx.beginPath()
  ctx.moveTo(x + tl, y)
  ctx.lineTo(x + w - tr, y)
  ctx.arcTo(x + w, y, x + w, y + tr, tr)
  ctx.lineTo(x + w, y + h - br)
  ctx.arcTo(x + w, y + h, x + w - br, y + h, br)
  ctx.lineTo(x + bl, y + h)
  ctx.arcTo(x, y + h, x, y + h - bl, bl)
  ctx.lineTo(x, y + tl)
  ctx.arcTo(x, y, x + tl, y, tl)
  ctx.closePath()
}

function tryLoadHtmlImage(
  src: string,
  options: { crossOrigin?: string; referrerPolicy?: string; timeoutMs?: number } = {}
): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    if (options.crossOrigin) img.crossOrigin = options.crossOrigin
    if (options.referrerPolicy) img.referrerPolicy = options.referrerPolicy
    const timer = setTimeout(() => resolve(null), options.timeoutMs ?? 10_000)
    img.onload = () => {
      clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(timer)
      resolve(null)
    }
    img.src = src
  })
}

async function loadImageSafe(src: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!src) return null

  if (src.startsWith("/api/image-proxy?")) {
    const proxied = await tryLoadHtmlImage(src, {
      crossOrigin: "anonymous",
      timeoutMs: 12_000,
    })
    if (proxied) return proxied

    const direct = new URLSearchParams(src.split("?")[1] ?? "").get("url")
    if (direct && /^https?:\/\//i.test(direct)) {
      return tryLoadHtmlImage(direct, {
        crossOrigin: "anonymous",
        referrerPolicy: "no-referrer",
        timeoutMs: 8_000,
      })
    }
    return null
  }

  if (src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("/")) {
    return tryLoadHtmlImage(src, { crossOrigin: "anonymous", timeoutMs: 12_000 })
  }

  const proxied = toImageProxyUrl(src)
  if (proxied) {
    const viaProxy = await tryLoadHtmlImage(proxied, {
      crossOrigin: "anonymous",
      timeoutMs: 12_000,
    })
    if (viaProxy) return viaProxy
  }

  if (/^https?:\/\//i.test(src)) {
    return tryLoadHtmlImage(src, {
      crossOrigin: "anonymous",
      referrerPolicy: "no-referrer",
      timeoutMs: 8_000,
    })
  }

  return null
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  alignTop = false
) {
  const imgRatio = img.naturalWidth / Math.max(1, img.naturalHeight)
  const boxRatio = dw / Math.max(1, dh)

  let sx = 0
  let sy = 0
  let sw = img.naturalWidth
  let sh = img.naturalHeight

  if (imgRatio > boxRatio) {
    sw = img.naturalHeight * boxRatio
    sx = (img.naturalWidth - sw) / 2
  } else {
    sh = img.naturalWidth / boxRatio
    sy = alignTop ? 0 : (img.naturalHeight - sh) / 2
  }

  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const lines: string[] = []
  let current = words[0]!

  for (let i = 1; i < words.length; i++) {
    const test = `${current} ${words[i]}`
    if (ctx.measureText(test).width <= maxWidth) {
      current = test
    } else {
      lines.push(current)
      current = words[i]!
      if (lines.length === maxLines - 1) {
        // Fill remaining words and truncate with ellipsis
        for (let j = i + 1; j < words.length; j++) {
          const next = `${current} ${words[j]}`
          if (ctx.measureText(next + "…").width <= maxWidth) {
            current = next
          } else {
            break
          }
        }
        if (i + 1 < words.length) {
          while (current.length > 3 && ctx.measureText(current + "…").width > maxWidth) {
            current = current.slice(0, -1)
          }
          current = current.trimEnd() + "…"
        }
        lines.push(current)
        return lines
      }
    }
  }
  lines.push(current)
  return lines.slice(0, maxLines)
}

function drawNoiseOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) {
  const tileSize = 96
  const tile = document.createElement("canvas")
  tile.width = tileSize
  tile.height = tileSize
  const tctx = tile.getContext("2d")
  if (!tctx) return
  const imgData = tctx.createImageData(tileSize, tileSize)
  // Deterministic pseudo-random grain so exports are consistent
  let seed = 1337
  for (let i = 0; i < imgData.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const v = seed & 255
    imgData.data[i] = v
    imgData.data[i + 1] = v
    imgData.data[i + 2] = v
    imgData.data[i + 3] = 16
  }
  tctx.putImageData(imgData, 0, 0)
  const pattern = ctx.createPattern(tile, "repeat")
  if (pattern) {
    ctx.save()
    ctx.fillStyle = pattern
    ctx.fillRect(0, 0, width, height)
    ctx.restore()
  }
}

function drawQrOnCanvas(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  darkColor = "#09090B"
) {
  const matrix = generateQrMatrix(value)
  const n = matrix.length
  const pad = Math.round(size * 0.09)
  const inner = size - pad * 2
  const cell = inner / n

  ctx.save()
  roundedRectPath(ctx, x, y, size, size, Math.round(size * 0.14))
  ctx.fillStyle = "#FFFFFF"
  ctx.fill()

  ctx.fillStyle = darkColor
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r]![c]) {
        ctx.fillRect(
          x + pad + c * cell,
          y + pad + r * cell,
          Math.ceil(cell),
          Math.ceil(cell)
        )
      }
    }
  }
  ctx.restore()
}

async function drawBackground(
  ctx: CanvasRenderingContext2D,
  state: StudioState,
  width: number,
  height: number,
  format: ExportFormat
) {
  if (state.backgroundType === "none") {
    if (format === "jpeg") {
      ctx.fillStyle = "#FFFFFF"
      ctx.fillRect(0, 0, width, height)
    }
    return
  }

  if (state.backgroundType === "color") {
    if (state.colorFillMode === "solid") {
      ctx.fillStyle = state.solidColor
      ctx.fillRect(0, 0, width, height)
    } else {
      const rad = ((state.gradientAngle - 90) * Math.PI) / 180
      const cx = width / 2
      const cy = height / 2
      const reach = Math.hypot(width, height) / 2
      const grad = ctx.createLinearGradient(
        cx - Math.cos(rad) * reach,
        cy - Math.sin(rad) * reach,
        cx + Math.cos(rad) * reach,
        cy + Math.sin(rad) * reach
      )
      grad.addColorStop(0, state.gradientFrom)
      if (state.gradientVia) {
        grad.addColorStop(0.5, state.gradientVia)
      }
      grad.addColorStop(1, state.gradientTo)
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, width, height)
    }

    if (state.noiseOverlay) {
      drawNoiseOverlay(ctx, width, height)
    }
    return
  }

  // Image or Unsplash
  const src = state.backgroundImageUrl
  const bgImg = await loadImageSafe(src)
  if (bgImg) {
    ctx.save()
    if (state.bgBlur > 0) {
      ctx.filter = `blur(${Math.round(state.bgBlur * (Math.min(width, height) / 500))}px)`
    }
    const overscan = state.bgBlur > 0 ? Math.round(state.bgBlur * 2) : 0
    drawCoverImage(
      ctx,
      bgImg,
      -overscan,
      -overscan,
      width + overscan * 2,
      height + overscan * 2
    )
    ctx.restore()
  } else {
    const fallback = ctx.createLinearGradient(0, 0, width, height)
    fallback.addColorStop(0, "#1E1B4B")
    fallback.addColorStop(1, "#312E81")
    ctx.fillStyle = fallback
    ctx.fillRect(0, 0, width, height)
  }

  if (state.bgDim > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.85, state.bgDim / 100)})`
    ctx.fillRect(0, 0, width, height)
  }
}

async function drawWebMode(
  ctx: CanvasRenderingContext2D,
  state: StudioState,
  width: number,
  height: number
) {
  const minDim = Math.min(width, height)
  const scaleFactor = (state.frameScale / 100) * (minDim / 500)
  const displayUrl = formatDisplayUrl(state.url)

  // Compute frame rect according to webLayout
  let fx = 0
  let fy = 0
  let fw = 0
  let fh = 0
  let radii: [number, number, number, number] = [20, 20, 20, 20]

  const userScale = state.frameScale / 100

  if (state.webLayout === "offset") {
    const leftPct = 0.11 + (1 - userScale) * 0.25
    const topPct = 0.265 + (1 - userScale) * 0.2
    fx = Math.round(width * leftPct)
    fy = Math.round(height * topPct)
    fw = width - fx + 12
    fh = height - fy + 12
    const r = Math.round(22 * scaleFactor)
    radii = [r, 0, 0, 0]
  } else if (state.webLayout === "centered") {
    fw = Math.round(width * 0.82 * userScale)
    fh = Math.round(height * 0.72 * userScale)
    fx = Math.round((width - fw) / 2)
    fy = Math.round((height - fh) / 2)
    const r = Math.round(16 * scaleFactor)
    radii = [r, r, r, r]
  } else if (state.webLayout === "docked") {
    fw = Math.round(width * 0.86 * userScale)
    fh = Math.round(height * 0.8 * userScale)
    fx = Math.round((width - fw) / 2)
    fy = height - fh + 8
    const r = Math.round(18 * scaleFactor)
    radii = [r, r, 0, 0]
  } else {
    // floating
    fw = Math.round(width * 0.76 * userScale)
    fh = Math.round(height * 0.66 * userScale)
    fx = Math.round((width - fw) / 2)
    fy = Math.round((height - fh) / 2)
    const r = Math.round(20 * scaleFactor)
    radii = [r, r, r, r]
  }

  // Shadow
  if (state.frameShadow > 0) {
    ctx.save()
    ctx.shadowColor = `rgba(9, 9, 14, ${0.15 + (state.frameShadow / 100) * 0.45})`
    ctx.shadowBlur = Math.round(48 * scaleFactor * (state.frameShadow / 100))
    ctx.shadowOffsetY = Math.round(20 * scaleFactor * (state.frameShadow / 100))
    roundedRectPath(ctx, fx, fy, fw, fh, radii)
    ctx.fillStyle = "#111114"
    ctx.fill()
    ctx.restore()
  }

  // Clip frame
  ctx.save()
  roundedRectPath(ctx, fx, fy, fw, fh, radii)
  ctx.clip()

  const isDarkChrome = state.chromeTheme === "dark"
  const isGlassChrome = state.chromeTheme === "glass"
  const bodyBg = isDarkChrome ? "#09090B" : "#FFFFFF"
  ctx.fillStyle = bodyBg
  ctx.fillRect(fx, fy, fw, fh)

  let contentTop = fy

  if (state.browserChrome === "chrome") {
    const tabBarH = Math.round(36 * scaleFactor)
    const navBarH = Math.round(44 * scaleFactor)
    const stripBg = isDarkChrome
      ? "#0D0D10"
      : isGlassChrome
        ? "rgba(24, 24, 27, 0.78)"
        : "#121215"
    const toolbarBg = isDarkChrome
      ? "#18181B"
      : isGlassChrome
        ? "rgba(255, 255, 255, 0.92)"
        : "#FFFFFF"

    // Top tab strip
    ctx.fillStyle = stripBg
    ctx.fillRect(fx, fy, fw, tabBarH)

    // 3 window dots
    const dotR = Math.max(3.5, 5.2 * scaleFactor)
    const dotY = fy + tabBarH / 2
    const dotStartX = fx + 18 * scaleFactor
    const dotColors = isDarkChrome
      ? ["#3F3F46", "#3F3F46", "#3F3F46"]
      : ["#3F3F46", "#3F3F46", "#3F3F46"]
    dotColors.forEach((col, i) => {
      ctx.beginPath()
      ctx.arc(dotStartX + i * 16 * scaleFactor, dotY, dotR, 0, Math.PI * 2)
      ctx.fillStyle = col
      ctx.fill()
    })

    // Curved active tab sticking up
    const tabX = dotStartX + 54 * scaleFactor
    const tabW = Math.min(fw * 0.44, 185 * scaleFactor)
    const tabTop = fy + 6 * scaleFactor
    const tabR = Math.round(10 * scaleFactor)
    roundedRectPath(ctx, tabX, tabTop, tabW, tabBarH - 6 * scaleFactor + 2, [
      tabR,
      tabR,
      0,
      0,
    ])
    ctx.fillStyle = toolbarBg
    ctx.fill()

    // Toolbar row
    const navY = fy + tabBarH
    ctx.fillStyle = toolbarBg
    ctx.fillRect(fx, navY, fw, navBarH)

    // Nav icons (< > refresh home)
    const iconColor = isDarkChrome ? "#A1A1AA" : "#18181B"
    ctx.strokeStyle = iconColor
    ctx.lineWidth = Math.max(1.4, 1.8 * scaleFactor)
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    const iconCy = navY + navBarH / 2
    const ix = fx + 18 * scaleFactor
    const s = 5 * scaleFactor

    // Back chevron <
    ctx.beginPath()
    ctx.moveTo(ix + s * 0.6, iconCy - s)
    ctx.lineTo(ix - s * 0.5, iconCy)
    ctx.lineTo(ix + s * 0.6, iconCy + s)
    ctx.stroke()

    // Forward chevron > (muted)
    ctx.save()
    ctx.globalAlpha = 0.35
    const fx2 = ix + 24 * scaleFactor
    ctx.beginPath()
    ctx.moveTo(fx2 - s * 0.5, iconCy - s)
    ctx.lineTo(fx2 + s * 0.6, iconCy)
    ctx.lineTo(fx2 - s * 0.5, iconCy + s)
    ctx.stroke()
    ctx.restore()

    // Refresh arc
    const rx = ix + 52 * scaleFactor
    ctx.beginPath()
    ctx.arc(rx, iconCy, s * 0.95, 0.3, Math.PI * 1.85)
    ctx.stroke()

    // Home icon
    const hx = ix + 80 * scaleFactor
    ctx.beginPath()
    ctx.moveTo(hx - s, iconCy)
    ctx.lineTo(hx, iconCy - s)
    ctx.lineTo(hx + s, iconCy)
    ctx.lineTo(hx + s, iconCy + s * 0.9)
    ctx.lineTo(hx - s, iconCy + s * 0.9)
    ctx.closePath()
    ctx.stroke()

    // URL pill
    const pillX = hx + 20 * scaleFactor
    const pillH = Math.round(30 * scaleFactor)
    const pillY = navY + (navBarH - pillH) / 2
    const pillW = Math.max(100, fx + fw - pillX - 14 * scaleFactor)
    roundedRectPath(ctx, pillX, pillY, pillW, pillH, Math.round(9 * scaleFactor))
    ctx.fillStyle = isDarkChrome ? "#27272A" : "#18181B"
    ctx.fill()

    // Lock badge inside URL pill
    const lockBoxSize = Math.round(20 * scaleFactor)
    roundedRectPath(
      ctx,
      pillX + 6 * scaleFactor,
      pillY + (pillH - lockBoxSize) / 2,
      lockBoxSize,
      lockBoxSize,
      Math.round(5 * scaleFactor)
    )
    ctx.fillStyle = "rgba(255,255,255,0.12)"
    ctx.fill()

    ctx.font = `500 ${Math.round(12.5 * scaleFactor)}px "DM Sans", system-ui, sans-serif`
    ctx.fillStyle = "#F4F4F5"
    ctx.textBaseline = "middle"
    ctx.fillText(
      displayUrl,
      pillX + 12 * scaleFactor + lockBoxSize + 4 * scaleFactor,
      pillY + pillH / 2 + 0.5,
      pillW - lockBoxSize - 24 * scaleFactor
    )

    contentTop = navY + navBarH
  } else if (state.browserChrome === "safari" || state.browserChrome === "arc") {
    const barH = Math.round(42 * scaleFactor)
    ctx.fillStyle = isDarkChrome ? "#18181B" : "#F4F4F5"
    ctx.fillRect(fx, fy, fw, barH)

    const dotR = Math.max(3.5, 4.8 * scaleFactor)
    const dotColors = ["#FF5F57", "#FEBC2E", "#28C840"]
    dotColors.forEach((col, i) => {
      ctx.beginPath()
      ctx.arc(fx + (18 + i * 16) * scaleFactor, fy + barH / 2, dotR, 0, Math.PI * 2)
      ctx.fillStyle = col
      ctx.fill()
    })

    const pillW = Math.min(fw * 0.56, 260 * scaleFactor)
    const pillH = Math.round(24 * scaleFactor)
    const pillX = fx + (fw - pillW) / 2
    const pillY = fy + (barH - pillH) / 2
    roundedRectPath(ctx, pillX, pillY, pillW, pillH, Math.round(7 * scaleFactor))
    ctx.fillStyle = isDarkChrome ? "#27272A" : "#FFFFFF"
    ctx.fill()

    ctx.font = `500 ${Math.round(11.5 * scaleFactor)}px "DM Sans", system-ui, sans-serif`
    ctx.fillStyle = isDarkChrome ? "#E4E4E7" : "#27272A"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(displayUrl, pillX + pillW / 2, pillY + pillH / 2 + 0.5, pillW - 18)
    ctx.textAlign = "left"

    contentTop = fy + barH
  } else if (state.browserChrome === "minimal") {
    const barH = Math.round(28 * scaleFactor)
    ctx.fillStyle = isDarkChrome ? "#141417" : "#F8FAFC"
    ctx.fillRect(fx, fy, fw, barH)
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.arc(
        fx + (14 + i * 12) * scaleFactor,
        fy + barH / 2,
        Math.max(2.5, 3.6 * scaleFactor),
        0,
        Math.PI * 2
      )
      ctx.fillStyle = isDarkChrome ? "#3F3F46" : "#CBD5E1"
      ctx.fill()
    }
    contentTop = fy + barH
  }

  // Viewport content
  const viewH = fy + fh - contentTop
  const screenshotSrc =
    state.customScreenshotUrl ||
    state.metadata?.screenshotUrl ||
    state.metadata?.ogImageUrl ||
    null

  const shotImg = await loadImageSafe(screenshotSrc)
  if (shotImg) {
    drawCoverImage(ctx, shotImg, fx, contentTop, fw, viewH, true)
  } else {
    // Crisp editorial hero fallback matching the uploaded mockup aesthetic
    const isDefaultSite = displayUrl.toLowerCase().includes("lerhem.space")
    ctx.fillStyle = isDarkChrome ? "#0B0B0E" : "#FFFFFF"
    ctx.fillRect(fx, contentTop, fw, viewH)

    // Subtle header row
    const padX = Math.round(20 * scaleFactor)
    ctx.font = `700 ${Math.round(11 * scaleFactor)}px "Instrument Sans", sans-serif`
    ctx.fillStyle = isDarkChrome ? "#F4F4F5" : "#09090B"
    ctx.textBaseline = "top"
    const brandText = isDefaultSite
      ? "RUSSELL NUMO"
      : (state.metadata?.siteName || displayUrl).toUpperCase()
    ctx.fillText(brandText, fx + padX, contentTop + 14 * scaleFactor)

    ctx.font = `500 ${Math.round(10 * scaleFactor)}px "DM Sans", sans-serif`
    ctx.fillStyle = isDarkChrome ? "#A1A1AA" : "#71717A"
    ctx.fillText("About", fx + fw - padX - 42 * scaleFactor, contentTop + 16 * scaleFactor)

    if (isDefaultSite) {
      const headlineY = contentTop + Math.round(viewH * 0.25)
      ctx.font = `900 ${Math.round(34 * scaleFactor)}px "Instrument Sans", Impact, sans-serif`
      ctx.fillStyle = isDarkChrome ? "#FAFAFA" : "#09090B"
      ctx.fillText("FRONTEND DEVELOPER", fx - 4 * scaleFactor, headlineY)
      ctx.fillText(
        "UX/UI DESIGNER",
        fx - 4 * scaleFactor,
        headlineY + 42 * scaleFactor
      )

      // Editorial frosted portrait block overlay
      const cardW = Math.round(118 * scaleFactor)
      const cardH = Math.round(138 * scaleFactor)
      const cardX = fx + Math.round((fw - cardW) * 0.48)
      const cardY = headlineY - 12 * scaleFactor
      ctx.fillStyle = "rgba(161, 161, 170, 0.55)"
      roundedRectPath(ctx, cardX, cardY, cardW, cardH, Math.round(8 * scaleFactor))
      ctx.fill()

      // Minimal silhouette glyph inside editorial block
      ctx.fillStyle = "rgba(24, 24, 27, 0.72)"
      ctx.beginPath()
      ctx.arc(cardX + cardW * 0.5, cardY + cardH * 0.46, cardW * 0.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(cardX + cardW * 0.5, cardY + cardH * 0.96, cardW * 0.36, Math.PI, 0)
      ctx.fill()
    } else {
      const title = state.metadata?.title || displayUrl
      const desc =
        state.metadata?.description ||
        "Share your product, portfolio, or social profile inside a clean browser frame."
      const titleY = contentTop + Math.round(viewH * 0.22)

      ctx.font = `700 ${Math.round(22 * scaleFactor)}px "Instrument Sans", sans-serif`
      ctx.fillStyle = isDarkChrome ? "#FAFAFA" : "#09090B"
      const titleLines = wrapLines(ctx, title, fw - padX * 2, 2)
      titleLines.forEach((line, idx) => {
        ctx.fillText(line, fx + padX, titleY + idx * 28 * scaleFactor)
      })

      ctx.font = `400 ${Math.round(13 * scaleFactor)}px "DM Sans", sans-serif`
      ctx.fillStyle = isDarkChrome ? "#A1A1AA" : "#52525B"
      const descY = titleY + titleLines.length * 28 * scaleFactor + 12 * scaleFactor
      const descLines = wrapLines(ctx, desc, fw - padX * 2, 3)
      descLines.forEach((line, idx) => {
        ctx.fillText(line, fx + padX, descY + idx * 20 * scaleFactor)
      })

      // Accent pill button
      const btnY = descY + descLines.length * 20 * scaleFactor + 20 * scaleFactor
      roundedRectPath(
        ctx,
        fx + padX,
        btnY,
        132 * scaleFactor,
        32 * scaleFactor,
        999
      )
      ctx.fillStyle = state.metadata?.themeColor || "#7C3AED"
      ctx.fill()

      ctx.font = `600 ${Math.round(11.5 * scaleFactor)}px "DM Sans", sans-serif`
      ctx.fillStyle = "#FFFFFF"
      ctx.fillText("Visit Website →", fx + padX + 18 * scaleFactor, btnY + 10 * scaleFactor)
    }
  }

  ctx.restore()
}

function drawCoverOrEmeraldMesh(
  ctx: CanvasRenderingContext2D,
  coverImg: HTMLImageElement | null,
  x: number,
  y: number,
  w: number,
  h: number
) {
  if (coverImg) {
    drawCoverImage(ctx, coverImg, x, y, w, h)
    return
  }
  const base = ctx.createLinearGradient(x, y, x + w, y + h)
  base.addColorStop(0, "#047857")
  base.addColorStop(0.5, "#22C55E")
  base.addColorStop(1, "#0F766E")
  ctx.fillStyle = base
  ctx.fillRect(x, y, w, h)

  const glow1 = ctx.createRadialGradient(
    x + w * 0.18,
    y + h * 0.22,
    0,
    x + w * 0.18,
    y + h * 0.22,
    w * 0.55
  )
  glow1.addColorStop(0, "rgba(167, 243, 208, 0.72)")
  glow1.addColorStop(1, "rgba(167, 243, 208, 0)")
  ctx.fillStyle = glow1
  ctx.fillRect(x, y, w, h)

  const glow2 = ctx.createRadialGradient(
    x + w * 0.82,
    y + h * 0.74,
    0,
    x + w * 0.82,
    y + h * 0.74,
    w * 0.6
  )
  glow2.addColorStop(0, "rgba(6, 95, 70, 0.7)")
  glow2.addColorStop(1, "rgba(6, 95, 70, 0)")
  ctx.fillStyle = glow2
  ctx.fillRect(x, y, w, h)
}

function drawVerifiedBadge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  badgeFill: string,
  checkColor: string
) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = badgeFill
  ctx.fill()

  ctx.strokeStyle = checkColor
  ctx.lineWidth = Math.max(1.3, r * 0.28)
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.42, cy + r * 0.04)
  ctx.lineTo(cx - r * 0.1, cy + r * 0.36)
  ctx.lineTo(cx + r * 0.44, cy - r * 0.3)
  ctx.stroke()
  ctx.restore()
}

function drawPlatformBadgePill(
  ctx: CanvasRenderingContext2D,
  label: string,
  anchorX: number,
  y: number,
  scaleFactor: number,
  accent: string,
  alignRight: boolean
) {
  ctx.save()
  ctx.font = `600 ${Math.round(10 * scaleFactor)}px "DM Sans", sans-serif`
  const textW = ctx.measureText(label).width
  const padX = Math.round(8 * scaleFactor)
  const dotR = Math.max(2.5, 3 * scaleFactor)
  const gap = Math.round(5 * scaleFactor)
  const pillH = Math.round(20 * scaleFactor)
  const pillW = Math.round(padX * 2 + dotR * 2 + gap + textW)
  const pillX = alignRight ? anchorX - pillW : anchorX

  roundedRectPath(ctx, pillX, y, pillW, pillH, 999)
  ctx.fillStyle = "rgba(0, 0, 0, 0.32)"
  ctx.fill()
  ctx.lineWidth = Math.max(1, scaleFactor * 0.8)
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)"
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(pillX + padX + dotR, y + pillH / 2, dotR, 0, Math.PI * 2)
  ctx.fillStyle = accent
  ctx.fill()

  ctx.fillStyle = "rgba(255, 255, 255, 0.94)"
  ctx.textAlign = "left"
  ctx.textBaseline = "middle"
  ctx.fillText(label, pillX + padX + dotR * 2 + gap, y + pillH / 2 + 0.5)
  ctx.restore()
}

function drawCircularAvatar(
  ctx: CanvasRenderingContext2D,
  avX: number,
  avY: number,
  avSize: number,
  avatarImg: HTMLImageElement | null,
  initial: string,
  accent: string,
  ringColor?: string,
  ringWidth = 0
) {
  ctx.save()
  if (ringColor && ringWidth > 0) {
    ctx.beginPath()
    ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2 + ringWidth, 0, Math.PI * 2)
    ctx.fillStyle = ringColor
    ctx.fill()
  }

  ctx.beginPath()
  ctx.arc(avX + avSize / 2, avY + avSize / 2, avSize / 2, 0, Math.PI * 2)
  ctx.clip()

  if (avatarImg) {
    drawCoverImage(ctx, avatarImg, avX, avY, avSize, avSize)
  } else {
    ctx.fillStyle = accent
    ctx.fillRect(avX, avY, avSize, avSize)
    ctx.font = `700 ${Math.round(avSize * 0.42)}px "Instrument Sans", sans-serif`
    ctx.fillStyle = "#FFFFFF"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(initial, avX + avSize / 2, avY + avSize / 2)
  }
  ctx.restore()
}

async function drawSocialMode(
  ctx: CanvasRenderingContext2D,
  state: StudioState,
  width: number,
  height: number
) {
  const minDim = Math.min(width, height)
  const userScale = state.frameScale / 100
  const scaleFactor = userScale * (minDim / 500)
  const platform = SOCIAL_PLATFORMS[state.socialPlatform] ?? SOCIAL_PLATFORMS.custom
  const isPill = state.socialCardStyle === "pill"
  const isFullCover = state.socialCardStyle === "glass"
  const isDarkSurface =
    state.socialCardTheme === "dark" ||
    (state.socialCardTheme === "glass" && state.socialCardStyle !== "elevated")
  const isLightSurface = !isDarkSurface

  const avatarSrc = state.socialAvatarUrl || state.metadata?.avatarUrl || null
  const coverSrc = state.socialCoverUrl || state.metadata?.coverUrl || null
  const [avatarImg, coverImg] = await Promise.all([
    loadImageSafe(avatarSrc),
    isPill ? Promise.resolve(null) : loadImageSafe(coverSrc),
  ])

  const displayName = state.socialDisplayName || "Olivia Rhye"
  const initial = displayName.charAt(0).toUpperCase() || "O"
  const handleText = state.socialHandle || "@Oliviar_"
  const displayUrl = formatDisplayUrl(state.url)

  const cardW = isPill
    ? Math.round(width * 0.86 * userScale)
    : Math.round(Math.min(width * 0.82 * userScale, 360 * scaleFactor))

  const pad = Math.round((isFullCover ? 20 : 14) * scaleFactor)
  const innerPadOffset = Math.round((isFullCover ? 0 : 6) * scaleFactor)
  const innerW = Math.max(80, cardW - pad * 2 - innerPadOffset * 2)

  ctx.font = `400 ${Math.round(12 * scaleFactor)}px "DM Sans", sans-serif`
  const descLines =
    !isPill && state.socialBio?.trim()
      ? wrapLines(ctx, state.socialBio, innerW, 2)
      : []
  const stats = isPill ? [] : parseSocialStats(state.socialMetrics)
  const isBentoStats = !isPill && !isFullCover && state.socialCardStyle === "bento"

  const browserBarH =
    !isPill && !isFullCover && state.socialCardStyle === "browser"
      ? Math.round(32 * scaleFactor)
      : 0
  const bannerH = isFullCover ? 0 : Math.round(108 * scaleFactor)
  const bannerRelY = browserBarH > 0 ? browserBarH + Math.round(12 * scaleFactor) : pad
  const avSize = Math.round((isFullCover ? 72 : 68) * scaleFactor)
  const avRelY = isFullCover
    ? Math.round(56 * scaleFactor)
    : bannerRelY + bannerH - Math.round(36 * scaleFactor)
  const rowRelY = avRelY + avSize + Math.round((isFullCover ? 12 : 8) * scaleFactor)
  const afterNameRelY = rowRelY + Math.round(38 * scaleFactor)

  let cursorRelY = afterNameRelY
  const bioLineStep = Math.round(17 * scaleFactor)
  const descRelY = cursorRelY + Math.round((isFullCover ? 10 : 8) * scaleFactor)
  if (descLines.length > 0) {
    cursorRelY = descRelY + descLines.length * bioLineStep
  }

  let dividerRelY = 0
  let statsRelY = 0
  const statsBoxH = Math.round((isBentoStats ? 46 : 36) * scaleFactor)
  if (stats.length > 0) {
    if (!isFullCover) {
      dividerRelY = cursorRelY + Math.round(10 * scaleFactor)
      statsRelY = dividerRelY + 1 + Math.round(10 * scaleFactor)
    } else {
      statsRelY = cursorRelY + Math.round(14 * scaleFactor)
    }
    cursorRelY = statsRelY + statsBoxH
  }

  const ctaRelY = cursorRelY + Math.round((isFullCover ? 16 : 14) * scaleFactor)
  const ctaH = Math.round(44 * scaleFactor)

  const cardH = isPill
    ? Math.round(Math.min(height * 0.42, 195 * scaleFactor))
    : ctaRelY + ctaH + pad
  const cx = Math.round((width - cardW) / 2)
  const cy = Math.round((height - cardH) / 2)
  const cardR = isPill ? Math.round(cardH / 2) : Math.round(28 * scaleFactor)

  // Drop shadow
  if (state.frameShadow > 0) {
    ctx.save()
    ctx.shadowColor = `rgba(0, 0, 0, ${0.18 + (state.frameShadow / 100) * 0.42})`
    ctx.shadowBlur = Math.round(44 * scaleFactor * (state.frameShadow / 100))
    ctx.shadowOffsetY = Math.round(18 * scaleFactor * (state.frameShadow / 100))
    roundedRectPath(ctx, cx, cy, cardW, cardH, cardR)
    ctx.fillStyle = isDarkSurface ? "#09090B" : "#FFFFFF"
    ctx.fill()
    ctx.restore()
  }

  ctx.save()
  roundedRectPath(ctx, cx, cy, cardW, cardH, cardR)
  ctx.clip()

  const fg = isFullCover || isDarkSurface ? "#FAFAFA" : "#09090B"
  const mutedFg = isFullCover
    ? "rgba(255,255,255,0.82)"
    : isDarkSurface
      ? "#A1A1AA"
      : "#52525B"

  if (isPill) {
    ctx.fillStyle = isLightSurface ? "rgba(255,255,255,0.94)" : "rgba(17,17,21,0.9)"
    ctx.fillRect(cx, cy, cardW, cardH)

    const pillAvSize = Math.round(cardH * 0.62)
    const avX = cx + Math.round((cardH - pillAvSize) / 2)
    const avY = cy + Math.round((cardH - pillAvSize) / 2)
    drawCircularAvatar(
      ctx,
      avX,
      avY,
      pillAvSize,
      avatarImg,
      initial,
      platform.accent,
      "rgba(255,255,255,0.8)",
      Math.round(2 * scaleFactor)
    )

    const textX = avX + pillAvSize + Math.round(16 * scaleFactor)
    const rightSpace = state.socialShowQr ? cardH * 0.72 : 110 * scaleFactor
    const textMaxW = Math.max(80, cx + cardW - textX - rightSpace)

    ctx.textBaseline = "top"
    ctx.textAlign = "left"
    ctx.font = `700 ${Math.round(18 * scaleFactor)}px "Instrument Sans", sans-serif`
    ctx.fillStyle = fg
    const badgeR = Math.round(7.5 * scaleFactor)
    const badgeSpace = state.socialVerified ? badgeR * 2 + Math.round(6 * scaleFactor) : 0
    const maxNameW = Math.max(40, textMaxW - badgeSpace)
    const measuredNameW = Math.min(ctx.measureText(displayName).width, maxNameW)
    ctx.fillText(displayName, textX, cy + cardH * 0.28, maxNameW)
    if (state.socialVerified) {
      drawVerifiedBadge(
        ctx,
        textX + measuredNameW + Math.round(6 * scaleFactor) + badgeR,
        cy + cardH * 0.28 + Math.round(9.5 * scaleFactor),
        badgeR,
        platform.accent,
        "#FFFFFF"
      )
    }

    ctx.font = `500 ${Math.round(13 * scaleFactor)}px "DM Sans", sans-serif`
    ctx.fillStyle = mutedFg
    ctx.fillText(
      `${handleText} · ${platform.shortLabel}`,
      textX,
      cy + cardH * 0.56,
      textMaxW
    )

    if (state.socialShowQr) {
      const qrSize = Math.round(cardH * 0.62)
      drawQrOnCanvas(
        ctx,
        normalizeUrl(state.url) || "https://www.lerhem.space",
        cx + cardW - qrSize - Math.round((cardH - qrSize) / 2),
        cy + Math.round((cardH - qrSize) / 2),
        qrSize
      )
    }
  } else {
    if (isFullCover) {
      drawCoverOrEmeraldMesh(ctx, coverImg, cx, cy, cardW, cardH)
      const scrim = ctx.createLinearGradient(cx, cy, cx, cy + cardH)
      scrim.addColorStop(0, "rgba(0,0,0,0.04)")
      scrim.addColorStop(0.44, "rgba(0,0,0,0.26)")
      scrim.addColorStop(1, "rgba(0,0,0,0.64)")
      ctx.fillStyle = scrim
      ctx.fillRect(cx, cy, cardW, cardH)

      drawPlatformBadgePill(
        ctx,
        platform.shortLabel,
        cx + Math.round(14 * scaleFactor),
        cy + Math.round(14 * scaleFactor),
        scaleFactor,
        platform.accent,
        false
      )

      if (state.socialShowQr) {
        const qrSize = Math.round(44 * scaleFactor)
        drawQrOnCanvas(
          ctx,
          normalizeUrl(state.url) || "https://www.lerhem.space",
          cx + cardW - Math.round(14 * scaleFactor) - qrSize,
          cy + Math.round(14 * scaleFactor),
          qrSize
        )
      }
    } else {
      ctx.fillStyle = isLightSurface ? "#FFFFFF" : "#111115"
      ctx.fillRect(cx, cy, cardW, cardH)

      if (browserBarH > 0) {
        ctx.fillStyle = isLightSurface
          ? "rgba(9,9,11,0.04)"
          : "rgba(255,255,255,0.05)"
        ctx.fillRect(cx, cy, cardW, browserBarH)
        for (let i = 0; i < 3; i++) {
          ctx.beginPath()
          ctx.arc(
            cx + (16 + i * 12) * scaleFactor,
            cy + browserBarH / 2,
            Math.max(2.5, 3.8 * scaleFactor),
            0,
            Math.PI * 2
          )
          ctx.fillStyle = ["#FF5F57", "#FEBC2E", "#28C840"][i]!
          ctx.fill()
        }
        ctx.font = `500 ${Math.round(10 * scaleFactor)}px ui-monospace, monospace`
        ctx.fillStyle = isLightSurface ? "rgba(9,9,11,0.6)" : "rgba(250,250,250,0.6)"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(displayUrl, cx + cardW / 2, cy + browserBarH / 2, cardW * 0.55)
        ctx.textAlign = "left"
      }

      // Inset rounded cover banner
      const bannerX = cx + pad
      const bannerY = cy + bannerRelY
      const bannerW = cardW - pad * 2
      ctx.save()
      roundedRectPath(
        ctx,
        bannerX,
        bannerY,
        bannerW,
        bannerH,
        Math.round(20 * scaleFactor)
      )
      ctx.clip()
      drawCoverOrEmeraldMesh(ctx, coverImg, bannerX, bannerY, bannerW, bannerH)
      ctx.restore()

      if (state.socialShowQr) {
        const qrSize = Math.round(44 * scaleFactor)
        drawQrOnCanvas(
          ctx,
          normalizeUrl(state.url) || "https://www.lerhem.space",
          bannerX + bannerW - Math.round(10 * scaleFactor) - qrSize,
          bannerY + Math.round(10 * scaleFactor),
          qrSize
        )
      } else {
        drawPlatformBadgePill(
          ctx,
          platform.shortLabel,
          bannerX + bannerW - Math.round(10 * scaleFactor),
          bannerY + Math.round(10 * scaleFactor),
          scaleFactor,
          platform.accent,
          true
        )
      }
    }

    // Circular Avatar
    const avX = cx + pad + Math.round((isFullCover ? 0 : 12) * scaleFactor)
    const avY = cy + avRelY
    drawCircularAvatar(
      ctx,
      avX,
      avY,
      avSize,
      avatarImg,
      initial,
      platform.accent,
      isFullCover
        ? "rgba(255,255,255,0.95)"
        : isLightSurface
          ? "#FFFFFF"
          : "#111115",
      Math.round((isFullCover ? 3 : 4) * scaleFactor)
    )

    // Name + Verified badge + Handle
    const innerPadX = cx + pad + innerPadOffset
    const rowY = cy + rowRelY
    const textMaxW = Math.max(80, innerW)
    ctx.textBaseline = "top"
    ctx.textAlign = "left"
    ctx.font = `700 ${Math.round(17 * scaleFactor)}px "Instrument Sans", sans-serif`
    ctx.fillStyle = fg

    const badgeR = Math.round(7.5 * scaleFactor)
    const badgeSpace = state.socialVerified ? badgeR * 2 + Math.round(6 * scaleFactor) : 0
    const maxNameW = Math.max(40, textMaxW - badgeSpace)
    const measuredNameW = Math.min(ctx.measureText(displayName).width, maxNameW)
    ctx.fillText(displayName, innerPadX, rowY, maxNameW)

    if (state.socialVerified) {
      drawVerifiedBadge(
        ctx,
        innerPadX + measuredNameW + Math.round(6 * scaleFactor) + badgeR,
        rowY + Math.round(9.5 * scaleFactor),
        badgeR,
        isFullCover ? "#FFFFFF" : platform.accent,
        isFullCover ? "#09090B" : "#FFFFFF"
      )
    }

    ctx.font = `500 ${Math.round(12 * scaleFactor)}px "DM Sans", sans-serif`
    ctx.fillStyle = mutedFg
    ctx.fillText(handleText, innerPadX, rowY + Math.round(21 * scaleFactor), textMaxW)

    // Description
    if (descLines.length > 0) {
      const descY = cy + descRelY
      ctx.font = `400 ${Math.round(12 * scaleFactor)}px "DM Sans", sans-serif`
      ctx.fillStyle = isFullCover
        ? "rgba(255,255,255,0.9)"
        : isDarkSurface
          ? "rgba(250,250,250,0.78)"
          : "rgba(9,9,11,0.75)"
      descLines.forEach((line, i) => {
        ctx.fillText(line, innerPadX, descY + i * bioLineStep)
      })
    }

    // Metrics row (only when metrics exist)
    if (stats.length > 0) {
      if (!isFullCover && dividerRelY > 0) {
        ctx.fillStyle = isLightSurface
          ? "rgba(228, 228, 231, 0.9)"
          : "rgba(255, 255, 255, 0.10)"
        ctx.fillRect(innerPadX, cy + dividerRelY, innerW, 1)
      }

      const statsY = cy + statsRelY
      const gap = Math.round(8 * scaleFactor)
      const colW = (innerW - gap * (stats.length - 1)) / stats.length

      stats.forEach((stat, idx) => {
        const colX = innerPadX + (colW + gap) * idx
        const colCx = colX + colW / 2
        if (isBentoStats) {
          roundedRectPath(ctx, colX, statsY, colW, statsBoxH, Math.round(12 * scaleFactor))
          ctx.fillStyle = isLightSurface
            ? "rgba(244, 244, 245, 0.85)"
            : "rgba(255, 255, 255, 0.06)"
          ctx.fill()
        }
        const textTop = isBentoStats ? statsY + Math.round(6 * scaleFactor) : statsY

        ctx.textAlign = "center"
        ctx.textBaseline = "top"
        ctx.font = `700 ${Math.round(15 * scaleFactor)}px "Instrument Sans", sans-serif`
        ctx.fillStyle = fg
        ctx.fillText(stat.value, colCx, textTop, colW - 8)

        ctx.font = `500 ${Math.round(11 * scaleFactor)}px "DM Sans", sans-serif`
        ctx.fillStyle = mutedFg
        ctx.fillText(stat.label, colCx, textTop + Math.round(19 * scaleFactor), colW - 8)
      })
      ctx.textAlign = "left"
    }

    // Full-Width Bottom Pill CTA Bar
    const ctaX = cx + pad
    const ctaY = cy + ctaRelY
    const ctaW = cardW - pad * 2
    roundedRectPath(ctx, ctaX, ctaY, ctaW, ctaH, 999)
    if (isFullCover || isDarkSurface) {
      ctx.fillStyle = "#FFFFFF"
    } else {
      const ctaGrad = ctx.createLinearGradient(ctaX, ctaY, ctaX + ctaW, ctaY)
      ctaGrad.addColorStop(0, "#09090B")
      ctaGrad.addColorStop(0.58, "#27272A")
      ctaGrad.addColorStop(1, "#52525B")
      ctx.fillStyle = ctaGrad
    }
    ctx.fill()

    // Left circular arrow badge inside CTA
    const circleR = Math.round(16 * scaleFactor)
    const circleCx = ctaX + Math.round(6 * scaleFactor) + circleR
    const circleCy = ctaY + ctaH / 2
    ctx.beginPath()
    ctx.arc(circleCx, circleCy, circleR, 0, Math.PI * 2)
    ctx.fillStyle = isFullCover || isDarkSurface ? "#09090B" : "#FFFFFF"
    ctx.fill()

    ctx.strokeStyle = isFullCover || isDarkSurface ? "#FFFFFF" : "#09090B"
    ctx.lineWidth = Math.max(1.4, 1.8 * scaleFactor)
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    const as = 4.5 * scaleFactor
    ctx.beginPath()
    ctx.moveTo(circleCx - as, circleCy)
    ctx.lineTo(circleCx + as, circleCy)
    ctx.moveTo(circleCx + as * 0.25, circleCy - as * 0.75)
    ctx.lineTo(circleCx + as, circleCy)
    ctx.lineTo(circleCx + as * 0.25, circleCy + as * 0.75)
    ctx.stroke()

    ctx.font = `600 ${Math.round(12.5 * scaleFactor)}px "DM Sans", sans-serif`
    ctx.fillStyle = isFullCover || isDarkSurface ? "#09090B" : "#FFFFFF"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(
      state.socialCtaLabel || "Get in Touch",
      ctaX + ctaW / 2,
      ctaY + ctaH / 2 + 0.5,
      ctaW - circleR * 4
    )
    ctx.textAlign = "left"
  }

  // Subtle card border ring
  ctx.lineWidth = Math.max(1, scaleFactor)
  ctx.strokeStyle = isFullCover
    ? "rgba(255,255,255,0.22)"
    : isDarkSurface
      ? "rgba(255,255,255,0.14)"
      : "rgba(9,9,11,0.09)"
  roundedRectPath(ctx, cx, cy, cardW, cardH, cardR)
  ctx.stroke()
  ctx.restore()
}

export async function renderStudioToCanvas(
  state: StudioState,
  options: { scale: ExportScale; format: ExportFormat }
): Promise<HTMLCanvasElement> {
  const { width: logicalW, height: logicalH } = resolveAspectDimensions(state)
  const scale = options.scale
  const canvas = document.createElement("canvas")
  canvas.width = logicalW * scale
  canvas.height = logicalH * scale

  const ctx = canvas.getContext("2d")
  if (!ctx) {
    throw new Error("Canvas 2D context is not available in this browser.")
  }

  ctx.save()
  ctx.scale(scale, scale)

  const outerRadius = getOuterBorderRadius(state.borderStyle, logicalW, logicalH)
  if (outerRadius > 0) {
    roundedRectPath(ctx, 0, 0, logicalW, logicalH, outerRadius)
    ctx.clip()
  }

  await drawBackground(ctx, state, logicalW, logicalH, options.format)

  if (state.mode === "web") {
    await drawWebMode(ctx, state, logicalW, logicalH)
  } else {
    await drawSocialMode(ctx, state, logicalW, logicalH)
  }

  ctx.restore()
  return canvas
}

export async function exportStudioBlob(
  state: StudioState,
  options: ExportOptions
): Promise<Blob> {
  const canvas = await renderStudioToCanvas(state, {
    scale: options.scale,
    format: options.format,
  })
  const mimeType =
    options.format === "jpeg"
      ? "image/jpeg"
      : options.format === "webp"
        ? "image/webp"
        : "image/png"

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not encode exported image."))
          return
        }
        resolve(blob)
      },
      mimeType,
      options.format === "png" ? undefined : 0.94
    )
  })
}

export async function downloadStudioImage(
  state: StudioState,
  options: ExportOptions
): Promise<void> {
  const blob = await exportStudioBlob(state, options)
  const objectUrl = URL.createObjectURL(blob)
  try {
    const cleanHost = formatDisplayUrl(state.url)
      .replace(/[^a-z0-9.-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
    const baseName =
      options.filename?.trim() || `prettylink-${cleanHost || "shot"}`
    const ext = options.format === "jpeg" ? "jpg" : options.format
    const a = document.createElement("a")
    a.href = objectUrl
    a.download = `${baseName}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  }
}

export async function copyStudioImageToClipboard(
  state: StudioState,
  scale: ExportScale = 2
): Promise<void> {
  if (
    typeof navigator === "undefined" ||
    !navigator.clipboard ||
    typeof ClipboardItem === "undefined"
  ) {
    throw new Error("Image clipboard copy is not supported in this browser.")
  }
  const blob = await exportStudioBlob(state, { format: "png", scale })
  await navigator.clipboard.write([
    new ClipboardItem({
      "image/png": blob,
    }),
  ])
}

"use client"

import * as React from "react"
import { resolveTabAccentColor } from "@/components/studio/web-mockup-card"
import { getFontStyleCssFamily } from "@/lib/presets"
import type { CodeLanguageId, StudioState } from "@/lib/studio-types"
import { formatDisplayUrl } from "@/lib/url-utils"
import { cn } from "@/lib/utils"

export const CODE_LANGUAGES: Array<{
  id: CodeLanguageId
  label: string
  shortBadge: string
}> = [
  { id: "typescript", label: "TypeScript", shortBadge: "TS" },
  { id: "javascript", label: "JavaScript", shortBadge: "JS" },
  { id: "python", label: "Python", shortBadge: "PY" },
  { id: "rust", label: "Rust", shortBadge: "RS" },
  { id: "go", label: "Go", shortBadge: "GO" },
  { id: "bash", label: "Shell", shortBadge: "SH" },
  { id: "json", label: "JSON", shortBadge: "JSON" },
  { id: "css", label: "CSS", shortBadge: "CSS" },
]

export type CodeTokenKind =
  | "plain"
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "function"
  | "property"

export interface CodeToken {
  text: string
  kind: CodeTokenKind
}

const KEYWORDS = new Set([
  "export",
  "import",
  "from",
  "const",
  "let",
  "var",
  "function",
  "async",
  "await",
  "return",
  "if",
  "else",
  "for",
  "while",
  "type",
  "interface",
  "class",
  "new",
  "true",
  "false",
  "null",
  "undefined",
  "def",
  "fn",
  "pub",
  "struct",
  "impl",
  "use",
  "package",
  "func",
])

const TOKEN_REGEX =
  /(\/\/.*$|#.*$|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b(?=\s*\()|\b[A-Za-z_][A-Za-z0-9_]*\b(?=\s*:)|\b[A-Za-z_][A-Za-z0-9_]*\b)/gm

export function tokenizeCodeLine(line: string): CodeToken[] {
  if (!line) return [{ text: " ", kind: "plain" }]
  const tokens: CodeToken[] = []
  let lastIndex = 0
  TOKEN_REGEX.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = TOKEN_REGEX.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        text: line.slice(lastIndex, match.index),
        kind: "plain",
      })
    }
    const tokenText = match[0]
    let kind: CodeTokenKind = "plain"
    if (tokenText.startsWith("//") || tokenText.startsWith("#")) {
      kind = "comment"
    } else if (
      tokenText.startsWith('"') ||
      tokenText.startsWith("'") ||
      tokenText.startsWith("`")
    ) {
      kind = "string"
    } else if (/^\d/.test(tokenText)) {
      kind = "number"
    } else if (KEYWORDS.has(tokenText)) {
      kind = "keyword"
    } else {
      const after = line.slice(match.index + tokenText.length)
      if (/^\s*\(/.test(after)) {
        kind = "function"
      } else if (/^\s*:/.test(after)) {
        kind = "property"
      }
    }
    tokens.push({ text: tokenText, kind })
    lastIndex = match.index + tokenText.length
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.slice(lastIndex), kind: "plain" })
  }
  return tokens
}

export function getTokenColor(kind: CodeTokenKind, isDark: boolean): string {
  switch (kind) {
    case "keyword":
      return isDark ? "#C084FC" : "#7C3AED"
    case "string":
      return isDark ? "#34D399" : "#059669"
    case "comment":
      return isDark ? "#71717A" : "#A1A1AA"
    case "number":
      return isDark ? "#FBBF24" : "#D97706"
    case "function":
      return isDark ? "#60A5FA" : "#2563EB"
    case "property":
      return isDark ? "#93C5FD" : "#0284C7"
    default:
      return isDark ? "#E4E4E7" : "#18181B"
  }
}

export interface ChangelogEntry {
  tag: "NEW" | "IMPROVED" | "FIXED"
  text: string
  color: string
  bg: string
}

export function parseChangelogItems(raw: string): ChangelogEntry[] {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 6)

  return lines.map((line) => {
    if (line.startsWith("+")) {
      return {
        tag: "NEW",
        text: line.slice(1).trim() || "New feature",
        color: "#10B981",
        bg: "rgba(16, 185, 129, 0.16)",
      }
    }
    if (line.startsWith("✓") || line.startsWith("!")) {
      return {
        tag: "FIXED",
        text: line.slice(1).trim() || "Bug fix",
        color: "#F59E0B",
        bg: "rgba(245, 158, 11, 0.16)",
      }
    }
    const cleaned = line.replace(/^[*•-]\s*/, "").trim()
    return {
      tag: "IMPROVED",
      text: cleaned || line,
      color: "#38BDF8",
      bg: "rgba(56, 189, 248, 0.16)",
    }
  })
}

export function CodeMockupCard({
  state,
  logicalWidth,
  logicalHeight,
}: {
  state: StudioState
  logicalWidth: number
  logicalHeight: number
}) {
  const minDim = Math.min(logicalWidth, logicalHeight)
  const scaleFactor = minDim / 500
  const userScale = state.frameScale / 100
  const isDark = state.codeTheme !== "light"
  const isGlass = state.codeTheme === "glass"
  const accentColor = resolveTabAccentColor(state)
  const displayUrl = formatDisplayUrl(state.url)
  const headingFontFamily = getFontStyleCssFamily(state.fontStyle)

  const shadowAlpha = 0.18 + (state.frameShadow / 100) * 0.42
  const shadowBlur = Math.round(42 * scaleFactor * (state.frameShadow / 100))
  const shadowY = Math.round(18 * scaleFactor * (state.frameShadow / 100))

  const offX = ((state.frameOffsetX ?? 0) / 100) * logicalWidth
  const offY = ((state.frameOffsetY ?? 0) / 100) * logicalHeight

  const langMeta =
    CODE_LANGUAGES.find((l) => l.id === state.codeLanguage) ??
    CODE_LANGUAGES[0]!

  if (state.codeCardStyle === "changelog") {
    const entries = parseChangelogItems(state.changelogItems)
    return (
      <div className="flex size-full items-center justify-center p-5">
        <div
          style={{
            transform: `translate(${offX}px, ${offY}px) scale(${userScale})`,
            boxShadow:
              state.frameShadow > 0
                ? `0 ${shadowY}px ${shadowBlur}px rgba(0, 0, 0, ${shadowAlpha})`
                : "none",
          }}
          className={cn(
            "w-[86%] max-w-[440px] overflow-hidden rounded-[24px] p-5 transition-shadow",
            isDark
              ? isGlass
                ? "bg-zinc-950/78 text-zinc-50 ring-1 ring-white/15 backdrop-blur-xl"
                : "bg-[#0D0D11] text-zinc-50 ring-1 ring-white/12"
              : "bg-white text-zinc-950 ring-1 ring-black/10"
          )}
        >
          {/* Top Release Version + Date Row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                style={{ backgroundColor: accentColor }}
                className="inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold text-white shadow-2xs"
              >
                {state.changelogVersion || "v2.4.0"}
              </span>
              <span className="text-[11px] font-medium opacity-60">
                {state.changelogDate || "Just Shipped"}
              </span>
            </div>
            <span className="truncate font-mono text-[10px] opacity-50">
              {displayUrl}
            </span>
          </div>

          {/* Release Title */}
          <h2
            style={{ fontFamily: headingFontFamily }}
            className="mt-3 line-clamp-2 font-heading text-lg leading-snug font-bold tracking-tight"
          >
            {state.changelogTitle || "Interactive Stage & Duo Device Showcases"}
          </h2>

          {/* Changelog Items */}
          <div className="mt-3.5 space-y-2">
            {entries.map((item, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex items-start gap-2.5 rounded-xl px-3 py-2 text-xs",
                  isDark ? "bg-white/[0.04]" : "bg-zinc-100/80"
                )}
              >
                <span
                  style={{
                    color: item.color,
                    backgroundColor: item.bg,
                  }}
                  className="mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider"
                >
                  {item.tag}
                </span>
                <span className="leading-relaxed opacity-90">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const codeLines = (state.codeContent || "").split("\n").slice(0, 16)

  return (
    <div className="flex size-full items-center justify-center p-5">
      <div
        style={{
          transform: `translate(${offX}px, ${offY}px) scale(${userScale})`,
          boxShadow:
            state.frameShadow > 0
              ? `0 ${shadowY}px ${shadowBlur}px rgba(0, 0, 0, ${shadowAlpha})`
              : "none",
        }}
        className={cn(
          "w-[88%] max-w-[450px] overflow-hidden rounded-[20px] transition-shadow",
          isDark
            ? isGlass
              ? "bg-zinc-950/80 text-zinc-100 ring-1 ring-white/15 backdrop-blur-xl"
              : "bg-[#0B0B0F] text-zinc-100 ring-1 ring-white/12"
            : "bg-white text-zinc-900 ring-1 ring-black/10"
        )}
      >
        {/* Window Top Chrome Bar */}
        <div
          className={cn(
            "flex items-center justify-between border-b px-4 py-2.5",
            isDark
              ? "border-white/8 bg-white/[0.03]"
              : "border-black/6 bg-zinc-50/90"
          )}
        >
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-[#FF5F57]" />
            <span className="size-2.5 rounded-full bg-[#FEBC2E]" />
            <span className="size-2.5 rounded-full bg-[#28C840]" />
          </div>

          <div className="flex items-center gap-1.5 truncate font-mono text-[11px] font-medium opacity-80">
            <span className="truncate">
              {state.codeFilename || "prettylink.config.ts"}
            </span>
          </div>

          <span
            style={{
              backgroundColor: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.06)",
            }}
            className="rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider uppercase opacity-75"
          >
            {langMeta.shortBadge}
          </span>
        </div>

        {/* Code Body */}
        <div className="overflow-x-hidden p-4 font-mono text-[11.5px] leading-[1.65]">
          {codeLines.map((line, lineIdx) => {
            const tokens = tokenizeCodeLine(line)
            return (
              <div key={lineIdx} className="flex items-baseline">
                {state.codeShowLineNumbers && (
                  <span className="mr-3.5 w-5 shrink-0 text-right text-[10px] opacity-35 select-none tabular-nums">
                    {lineIdx + 1}
                  </span>
                )}
                <div className="min-w-0 flex-1 whitespace-pre-wrap break-all">
                  {tokens.map((tok, tokIdx) => (
                    <span
                      key={tokIdx}
                      style={{ color: getTokenColor(tok.kind, isDark) }}
                    >
                      {tok.text}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Subtle Footer Bar */}
        <div
          className={cn(
            "flex items-center justify-between border-t px-4 py-1.5 font-mono text-[10px] opacity-55",
            isDark ? "border-white/6 bg-white/[0.015]" : "border-black/5 bg-zinc-50/50"
          )}
        >
          <span>{langMeta.label}</span>
          <span className="truncate">{displayUrl}</span>
        </div>
      </div>
    </div>
  )
}

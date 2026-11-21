import dns from "node:dns"
import http from "node:http"
import https from "node:https"
import net from "node:net"
import zlib from "node:zlib"
import { validatePublicUrl } from "@/lib/url-utils"

try {
  dns.setDefaultResultOrder("ipv4first")
} catch {
  // Ignore on runtimes that disallow changing DNS result order
}

try {
  if (typeof net.setDefaultAutoSelectFamilyAttemptTimeout === "function") {
    net.setDefaultAutoSelectFamilyAttemptTimeout(4000)
  }
} catch {
  // Ignore on runtimes that disallow modifying socket defaults
}

export const DEFAULT_BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

const SKIPPED_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
])

function decompressBuffer(buf: Buffer, encoding: string): Buffer {
  const normalized = encoding.toLowerCase().trim()
  if (!normalized || normalized === "identity") {
    return buf
  }

  try {
    if (normalized.includes("gzip")) {
      return zlib.gunzipSync(buf)
    }
    if (normalized.includes("br")) {
      return zlib.brotliDecompressSync(buf)
    }
    if (normalized.includes("deflate")) {
      return zlib.inflateSync(buf)
    }
  } catch {
    return buf
  }

  return buf
}

function toResponseHeaders(rawHeaders: http.IncomingHttpHeaders): Headers {
  const resHeaders = new Headers()
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (!value || key.startsWith(":")) continue
    if (SKIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) continue

    try {
      if (Array.isArray(value)) {
        for (const item of value) {
          resHeaders.append(key, item)
        }
      } else {
        resHeaders.set(key, value)
      }
    } catch {
      // Ignore malformed upstream headers
    }
  }
  return resHeaders
}

function nodeGetRequest(
  url: URL,
  headers: Record<string, string>,
  timeoutMs: number,
  maxBytes = 12 * 1024 * 1024
): Promise<Response> {
  const client = url.protocol === "http:" ? http : https

  return new Promise<Response>((resolve, reject) => {
    let settled = false

    const fail = (err: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(wallTimer)
      reject(err instanceof Error ? err : new Error(String(err)))
    }

    const req = client.request(
      url,
      {
        method: "GET",
        headers: {
          "accept-encoding": "gzip, deflate, br",
          ...headers,
        },
        family: 4,
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 500
        if (status < 200 || status > 599) {
          res.destroy()
          fail(new Error(`Upstream returned invalid HTTP status ${status}.`))
          return
        }

        const resHeaders = toResponseHeaders(res.headers)
        const isNullBodyOrRedirect =
          status === 204 ||
          status === 205 ||
          status === 304 ||
          (status >= 300 && status < 400)

        if (isNullBodyOrRedirect) {
          settled = true
          clearTimeout(wallTimer)
          res.destroy()
          resolve(new Response(null, { status, headers: resHeaders }))
          return
        }

        const declaredLength = Number(res.headers["content-length"] ?? "0")
        if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
          res.destroy()
          fail(new Error("Upstream response exceeds maximum allowed size."))
          return
        }

        const chunks: Buffer[] = []
        let totalBytes = 0

        res.on("data", (chunk: Buffer | string) => {
          if (settled) return
          const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk
          totalBytes += buf.length
          if (totalBytes > maxBytes) {
            res.destroy()
            req.destroy()
            fail(new Error("Upstream response exceeds maximum allowed size."))
            return
          }
          chunks.push(buf)
        })

        res.on("end", () => {
          if (settled) return
          settled = true
          clearTimeout(wallTimer)

          const rawBody = Buffer.concat(chunks)
          const encoding =
            typeof res.headers["content-encoding"] === "string"
              ? res.headers["content-encoding"]
              : ""
          const decodedBody = encoding
            ? decompressBuffer(rawBody, encoding)
            : rawBody

          resolve(
            new Response(new Uint8Array(decodedBody), {
              status,
              headers: resHeaders,
            })
          )
        })

        res.on("error", fail)
      }
    )

    const wallTimer = setTimeout(() => {
      req.destroy(new Error(`Upstream request timed out after ${timeoutMs}ms.`))
    }, timeoutMs)

    req.on("timeout", () => {
      req.destroy(new Error(`Upstream socket timed out after ${timeoutMs}ms.`))
    })

    req.on("error", fail)
    req.end()
  })
}

export async function safePublicFetch(
  rawUrl: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<{ response: Response; finalUrl: URL }> {
  const { timeoutMs = 9000, headers: initHeaders } = init
  const headers = new Headers(initHeaders)
  if (!headers.has("user-agent")) {
    headers.set("user-agent", DEFAULT_BROWSER_UA)
  }

  const baseHeaders: Record<string, string> = {}
  headers.forEach((value, key) => {
    baseHeaders[key] = value
  })

  let current = rawUrl

  for (let hop = 0; hop <= 5; hop++) {
    const check = validatePublicUrl(current)
    if (!check.ok) {
      throw new Error(check.error)
    }

    const res = await nodeGetRequest(check.url, baseHeaders, timeoutMs)

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location")
      if (!location) {
        return { response: res, finalUrl: check.url }
      }
      current = new URL(location, check.url).toString()
      continue
    }

    return { response: res, finalUrl: check.url }
  }

  throw new Error("Too many redirects while fetching target URL.")
}

export async function readHtmlHeadSnippet(
  response: Response,
  maxBytes = 49_152
): Promise<string> {
  const text = await response.text()
  const headEndMatch = /<\/head>/i.exec(text)
  const limit = headEndMatch
    ? Math.min(headEndMatch.index + headEndMatch[0].length, maxBytes)
    : maxBytes
  return text.slice(0, limit)
}

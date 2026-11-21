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

const DEFAULT_MAX_BYTES = 12 * 1024 * 1024

const SKIPPED_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
])

function parseEncodings(encoding: string): string[] {
  return encoding
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0 && part !== "identity")
    .reverse()
}

function decompressBuffer(
  buf: Buffer,
  encoding: string,
  maxBytes: number
): Buffer {
  const encodings = parseEncodings(encoding)
  if (encodings.length === 0 || buf.length === 0) {
    if (buf.byteLength > maxBytes) {
      throw new Error("Upstream response exceeds maximum allowed size.")
    }
    return buf
  }

  let current = buf
  for (const enc of encodings) {
    if (enc === "gzip" || enc === "x-gzip") {
      current = zlib.gunzipSync(current, { maxOutputLength: maxBytes })
    } else if (enc === "br") {
      current = zlib.brotliDecompressSync(current, { maxOutputLength: maxBytes })
    } else if (enc === "deflate") {
      current = zlib.inflateSync(current, { maxOutputLength: maxBytes })
    } else {
      throw new Error(`Unsupported content-encoding: ${enc}`)
    }
  }

  if (current.byteLength > maxBytes) {
    throw new Error("Decoded upstream response exceeds maximum allowed size.")
  }

  return current
}

type DecoderTransform = zlib.Gunzip | zlib.BrotliDecompress | zlib.Inflate

function createDecoderStream(
  enc: string,
  maxOutputLength: number
): DecoderTransform {
  if (enc === "gzip" || enc === "x-gzip") {
    return zlib.createGunzip({ maxOutputLength })
  }
  if (enc === "br") {
    return zlib.createBrotliDecompress({ maxOutputLength })
  }
  if (enc === "deflate") {
    return zlib.createInflate({ maxOutputLength })
  }
  throw new Error(`Unsupported content-encoding: ${enc}`)
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
  maxBytes = DEFAULT_MAX_BYTES,
  stream = false
): Promise<Response> {
  const client = url.protocol === "http:" ? http : https

  return new Promise<Response>((resolve, reject) => {
    let settled = false
    let onTimeout = () => {
      req.destroy(new Error(`Upstream request timed out after ${timeoutMs}ms.`))
    }

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

        if (stream) {
          const encoding =
            typeof res.headers["content-encoding"] === "string"
              ? res.headers["content-encoding"]
              : ""
          const encodings = parseEncodings(encoding)
          const decoderMaxOutput = maxBytes + 65_536

          let decoders: DecoderTransform[] = []
          try {
            decoders = encodings.map((enc) =>
              createDecoderStream(enc, decoderMaxOutput)
            )
          } catch (err) {
            res.destroy()
            req.destroy()
            fail(err)
            return
          }

          let outputStream: NodeJS.ReadableStream = res
          for (const decoder of decoders) {
            outputStream = outputStream.pipe(decoder)
          }

          let wireBytes = 0
          let decodedBytes = 0
          let streamDone = false
          const maxWireBytes = Math.max(maxBytes * 4, 256 * 1024)

          const teardownStreams = () => {
            clearTimeout(wallTimer)
            for (const decoder of decoders) {
              decoder.destroy()
            }
            res.destroy()
            req.destroy()
          }

          let abortStream: (err: unknown) => void = (err) => {
            if (streamDone) return
            streamDone = true
            teardownStreams()
            void err
          }

          const readable = new ReadableStream<Uint8Array>({
            start(controller) {
              const closeCleanly = () => {
                if (streamDone) return
                streamDone = true
                teardownStreams()
                try {
                  controller.close()
                } catch {
                  // Stream already closed or errored
                }
              }

              abortStream = (err: unknown) => {
                if (streamDone) return
                streamDone = true
                teardownStreams()
                const error = err instanceof Error ? err : new Error(String(err))
                try {
                  controller.error(error)
                } catch {
                  // Stream already closed or errored
                }
              }

              onTimeout = () => {
                abortStream(
                  new Error(`Upstream stream timed out after ${timeoutMs}ms.`)
                )
              }

              if (decoders.length > 0) {
                res.on("data", (chunk: Buffer | string) => {
                  if (streamDone) return
                  const len =
                    typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length
                  wireBytes += len
                  if (wireBytes > maxWireBytes) {
                    abortStream(
                      new Error("Upstream response exceeds maximum allowed size.")
                    )
                  }
                })
              }

              res.on("error", abortStream)
              for (const decoder of decoders) {
                decoder.on("error", abortStream)
              }
              req.on("error", abortStream)

              outputStream.on("data", (chunk: Buffer | string) => {
                if (streamDone) return
                const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk
                const remaining = maxBytes - decodedBytes
                if (remaining <= 0) {
                  closeCleanly()
                  return
                }

                if (buf.byteLength >= remaining) {
                  const bounded =
                    buf.byteLength > remaining ? buf.subarray(0, remaining) : buf
                  decodedBytes += bounded.byteLength
                  controller.enqueue(new Uint8Array(bounded))
                  closeCleanly()
                  return
                }

                decodedBytes += buf.byteLength
                outputStream.pause()
                controller.enqueue(new Uint8Array(buf))
              })

              outputStream.on("end", closeCleanly)
              outputStream.on("close", () => {
                if (!streamDone) {
                  abortStream(new Error("Upstream stream closed unexpectedly."))
                }
              })

              outputStream.pause()
            },
            pull() {
              if (!streamDone) {
                outputStream.resume()
              }
            },
            cancel() {
              if (streamDone) return
              streamDone = true
              teardownStreams()
            },
          })

          settled = true
          resolve(new Response(readable, { status, headers: resHeaders }))
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

          const rawBody = Buffer.concat(chunks)
          const encoding =
            typeof res.headers["content-encoding"] === "string"
              ? res.headers["content-encoding"]
              : ""

          let decodedBody: Buffer
          try {
            decodedBody = encoding
              ? decompressBuffer(rawBody, encoding, maxBytes)
              : rawBody
          } catch (err) {
            fail(err)
            return
          }

          settled = true
          clearTimeout(wallTimer)

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
      onTimeout()
    }, timeoutMs)

    req.on("timeout", () => {
      onTimeout()
    })

    req.on("error", fail)
    req.end()
  })
}

export async function safePublicFetch(
  rawUrl: string,
  init: RequestInit & {
    timeoutMs?: number
    maxBytes?: number
    stream?: boolean
  } = {}
): Promise<{ response: Response; finalUrl: URL }> {
  const {
    timeoutMs = 9000,
    maxBytes = DEFAULT_MAX_BYTES,
    stream = false,
    headers: initHeaders,
  } = init
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

    const res = await nodeGetRequest(
      check.url,
      baseHeaders,
      timeoutMs,
      maxBytes,
      stream
    )

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
  if (!response.body) {
    const text = (await response.text()).slice(0, maxBytes)
    const headEnd = /<\/head>/i.exec(text)
    return headEnd ? text.slice(0, headEnd.index + headEnd[0].length) : text
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let html = ""
  let totalBytes = 0

  try {
    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read()
      if (done || !value) break

      const remaining = maxBytes - totalBytes
      const slice =
        value.byteLength > remaining ? value.subarray(0, remaining) : value
      totalBytes += slice.byteLength
      html += decoder.decode(slice, { stream: totalBytes < maxBytes })

      const headEnd = /<\/head>/i.exec(html)
      if (headEnd) {
        return html.slice(0, headEnd.index + headEnd[0].length)
      }
    }

    html += decoder.decode()
    const headEnd = /<\/head>/i.exec(html)
    return headEnd ? html.slice(0, headEnd.index + headEnd[0].length) : html
  } finally {
    await reader.cancel().catch(() => {})
  }
}

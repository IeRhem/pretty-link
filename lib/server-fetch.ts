import { validatePublicUrl } from "@/lib/url-utils"

export async function safePublicFetch(
  rawUrl: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<{ response: Response; finalUrl: URL }> {
  const { timeoutMs = 6000, ...fetchInit } = init
  let current = rawUrl

  for (let hop = 0; hop <= 5; hop++) {
    const check = validatePublicUrl(current)
    if (!check.ok) {
      throw new Error(check.error)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    let res: Response
    try {
      res = await fetch(check.url.toString(), {
        ...fetchInit,
        redirect: "manual",
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

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
    return (await response.text()).slice(0, maxBytes)
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
      const slice = value.byteLength > remaining ? value.subarray(0, remaining) : value
      totalBytes += slice.byteLength
      html += decoder.decode(slice, { stream: totalBytes < maxBytes })

      if (/<\/head>/i.test(html)) {
        break
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
  }

  return html
}

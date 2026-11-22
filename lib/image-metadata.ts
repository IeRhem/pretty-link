import { normalizeUrl } from "@/lib/url-utils"

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function buildXmpPacket(url: string, title?: string): string {
  const safeUrl = escapeXml(url)
  const safeTitle = title?.trim() ? escapeXml(title.trim()) : ""
  const safeDesc = safeTitle ? `${safeTitle} — ${safeUrl}` : safeUrl

  return [
    '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '    <rdf:Description rdf:about=""',
    '      xmlns:dc="http://purl.org/dc/elements/1.1/"',
    '      xmlns:xmp="http://ns.adobe.com/xap/1.0/"',
    '      xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"',
    '      xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/">',
    `      <dc:source>${safeUrl}</dc:source>`,
    `      <xmp:BaseURL>${safeUrl}</xmp:BaseURL>`,
    `      <photoshop:Source>${safeUrl}</photoshop:Source>`,
    `      <Iptc4xmpCore:CiUrlWork>${safeUrl}</Iptc4xmpCore:CiUrlWork>`,
    "      <dc:relation>",
    "        <rdf:Bag>",
    `          <rdf:li>${safeUrl}</rdf:li>`,
    "        </rdf:Bag>",
    "      </dc:relation>",
    "      <dc:description>",
    "        <rdf:Alt>",
    `          <rdf:li xml:lang="x-default">${safeDesc}</rdf:li>`,
    "        </rdf:Alt>",
    "      </dc:description>",
    ...(safeTitle
      ? [
          "      <dc:title>",
          "        <rdf:Alt>",
          `          <rdf:li xml:lang="x-default">${safeTitle}</rdf:li>`,
          "        </rdf:Alt>",
          "      </dc:title>",
        ]
      : []),
    "    </rdf:Description>",
    "  </rdf:RDF>",
    "</x:xmpmeta>",
    '<?xpacket end="w"?>',
  ].join("\n")
}

function concatUint8Arrays(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function createPngITXtChunk(keyword: string, text: string): Uint8Array {
  const encoder = new TextEncoder()
  const kwBytes = encoder.encode(keyword).slice(0, 79)
  const textBytes = encoder.encode(text)
  const typeBytes = encoder.encode("iTXt")

  // keyword + \0 + compressionFlag(0) + compressionMethod(0) + langTag(\0) + translatedKw(\0) + text
  const payload = new Uint8Array(kwBytes.length + 5 + textBytes.length)
  payload.set(kwBytes, 0)
  payload[kwBytes.length] = 0 // null separator
  payload[kwBytes.length + 1] = 0 // compression flag = 0 (uncompressed)
  payload[kwBytes.length + 2] = 0 // compression method = 0
  payload[kwBytes.length + 3] = 0 // empty language tag
  payload[kwBytes.length + 4] = 0 // empty translated keyword
  payload.set(textBytes, kwBytes.length + 5)

  const chunk = new Uint8Array(4 + 4 + payload.length + 4)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, payload.length, false)
  chunk.set(typeBytes, 4)
  chunk.set(payload, 8)

  const crcInput = chunk.subarray(4, 8 + payload.length)
  view.setUint32(8 + payload.length, crc32(crcInput), false)
  return chunk
}

function injectPngMetadata(
  bytes: Uint8Array,
  url: string,
  title?: string
): Uint8Array | null {
  if (bytes.length < 33) return null
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return null
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const ihdrLen = view.getUint32(8, false)
  const ihdrType = String.fromCharCode(
    bytes[12]!,
    bytes[13]!,
    bytes[14]!,
    bytes[15]!
  )
  if (ihdrType !== "IHDR") return null

  const insertAt = 8 + 4 + 4 + ihdrLen + 4
  if (insertAt > bytes.length) return null

  const xmp = buildXmpPacket(url, title)
  const chunks = [
    createPngITXtChunk("XML:com.adobe.xmp", xmp),
    createPngITXtChunk("Captured from", url),
    createPngITXtChunk("DocumentName", url),
    createPngITXtChunk("Source", url),
    createPngITXtChunk("URL", url),
    createPngITXtChunk("Comment", url),
  ]

  return concatUint8Arrays([
    bytes.subarray(0, insertAt),
    ...chunks,
    bytes.subarray(insertAt),
  ])
}

function writeAsciiZ(text: string): Uint8Array {
  const encoded = new TextEncoder().encode(text)
  const out = new Uint8Array(encoded.length + 1)
  out.set(encoded, 0)
  out[encoded.length] = 0
  return out
}

function buildExifApp1Segment(url: string): Uint8Array | null {
  const encoder = new TextEncoder()
  const urlZ = writeAsciiZ(url)
  const software = writeAsciiZ("Chrome")
  const urlBytes = encoder.encode(url)
  const userComment = new Uint8Array(8 + urlBytes.length)
  userComment.set(encoder.encode("ASCII\0\0\0"), 0)
  userComment.set(urlBytes, 8)

  // Little-endian TIFF:
  // 8-byte header + IFD0 (2 + 6*12 + 4 = 78 bytes) => Exif SubIFD at offset 86
  // Exif SubIFD (2 + 1*12 + 4 = 18 bytes) => Data area starts at offset 104
  const ifd0Offset = 8
  const ifd0Size = 2 + 6 * 12 + 4
  const exifIfdOffset = ifd0Offset + ifd0Size // 86
  const exifIfdSize = 2 + 1 * 12 + 4
  let dataCursor = exifIfdOffset + exifIfdSize // 104

  const extraData: Uint8Array[] = []
  const allocData = (buf: Uint8Array): number => {
    const off = dataCursor
    extraData.push(buf)
    dataCursor += buf.length
    return off
  }

  const urlOffset = urlZ.length > 4 ? allocData(urlZ) : 0
  const swOffset = software.length > 4 ? allocData(software) : 0
  const ucOffset = userComment.length > 4 ? allocData(userComment) : 0

  const tiffLen = dataCursor
  const exifHeader = encoder.encode("Exif\0\0")
  const payloadLen = exifHeader.length + tiffLen
  if (payloadLen + 2 > 0xffff) return null

  const segment = new Uint8Array(4 + payloadLen)
  const view = new DataView(segment.buffer)
  segment[0] = 0xff
  segment[1] = 0xe1
  view.setUint16(2, payloadLen + 2, false)
  segment.set(exifHeader, 4)

  const tiffStart = 4 + exifHeader.length
  const tiffView = new DataView(segment.buffer, tiffStart, tiffLen)

  // TIFF Header ("II", 42, IFD0 = 8)
  segment[tiffStart] = 0x49
  segment[tiffStart + 1] = 0x49
  tiffView.setUint16(2, 42, true)
  tiffView.setUint32(4, ifd0Offset, true)

  const writeIfdEntry = (
    offset: number,
    tag: number,
    type: number,
    count: number,
    valueOrOffset: number,
    inlineBytes?: Uint8Array
  ) => {
    tiffView.setUint16(offset, tag, true)
    tiffView.setUint16(offset + 2, type, true)
    tiffView.setUint32(offset + 4, count, true)
    if (inlineBytes && inlineBytes.length <= 4) {
      for (let i = 0; i < 4; i++) {
        segment[tiffStart + offset + 8 + i] = inlineBytes[i] ?? 0
      }
    } else {
      tiffView.setUint32(offset + 8, valueOrOffset, true)
    }
  }

  // IFD0: count = 6 (ascending tag order: 0x010D, 0x010E, 0x011D, 0x0131, 0x013C, 0x8769)
  tiffView.setUint16(ifd0Offset, 6, true)
  writeIfdEntry(ifd0Offset + 2, 0x010d, 2, urlZ.length, urlOffset, urlZ) // DocumentName
  writeIfdEntry(ifd0Offset + 14, 0x010e, 2, urlZ.length, urlOffset, urlZ) // ImageDescription
  writeIfdEntry(ifd0Offset + 26, 0x011d, 2, urlZ.length, urlOffset, urlZ) // PageName
  writeIfdEntry(ifd0Offset + 38, 0x0131, 2, software.length, swOffset, software) // Software
  writeIfdEntry(ifd0Offset + 50, 0x013c, 2, urlZ.length, urlOffset, urlZ) // HostComputer
  writeIfdEntry(ifd0Offset + 62, 0x8769, 4, 1, exifIfdOffset) // ExifIFDPointer
  tiffView.setUint32(ifd0Offset + 74, 0, true)

  // Exif SubIFD: count = 1 (0x9286 UserComment)
  tiffView.setUint16(exifIfdOffset, 1, true)
  writeIfdEntry(
    exifIfdOffset + 2,
    0x9286,
    7,
    userComment.length,
    ucOffset,
    userComment
  )
  tiffView.setUint32(exifIfdOffset + 14, 0, true)

  let writePos = tiffStart + exifIfdOffset + exifIfdSize
  for (const buf of extraData) {
    segment.set(buf, writePos)
    writePos += buf.length
  }

  return segment
}

function buildXmpApp1Segment(url: string, title?: string): Uint8Array | null {
  const encoder = new TextEncoder()
  const nsHeader = encoder.encode("http://ns.adobe.com/xap/1.0/\0")
  const xmpBytes = encoder.encode(buildXmpPacket(url, title))
  const payloadLen = nsHeader.length + xmpBytes.length
  if (payloadLen + 2 > 0xffff) return null

  const segment = new Uint8Array(4 + payloadLen)
  const view = new DataView(segment.buffer)
  segment[0] = 0xff
  segment[1] = 0xe1
  view.setUint16(2, payloadLen + 2, false)
  segment.set(nsHeader, 4)
  segment.set(xmpBytes, 4 + nsHeader.length)
  return segment
}

function injectJpegMetadata(
  bytes: Uint8Array,
  url: string,
  title?: string
): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null
  }

  let insertAt = 2
  // Keep JFIF APP0 right after SOI when present
  if (bytes.length >= 6 && bytes[2] === 0xff && bytes[3] === 0xe0) {
    const app0Len = (bytes[4]! << 8) | bytes[5]!
    if (app0Len >= 2 && 4 + app0Len <= bytes.length) {
      insertAt = 4 + app0Len
    }
  }

  const segments: Uint8Array[] = []
  const exifSeg = buildExifApp1Segment(url)
  if (exifSeg) segments.push(exifSeg)
  const xmpSeg = buildXmpApp1Segment(url, title)
  if (xmpSeg) segments.push(xmpSeg)
  if (segments.length === 0) return null

  return concatUint8Arrays([
    bytes.subarray(0, insertAt),
    ...segments,
    bytes.subarray(insertAt),
  ])
}

export async function embedUrlMetadataInImageBlob(
  blob: Blob,
  rawUrl: string,
  title?: string
): Promise<Blob> {
  const type = blob.type.toLowerCase()
  if (type !== "image/png" && type !== "image/jpeg") {
    return blob
  }

  const normalized = normalizeUrl(rawUrl) || "https://www.lerhem.space"
  try {
    const buffer = await blob.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const patched =
      type === "image/png"
        ? injectPngMetadata(bytes, normalized, title)
        : injectJpegMetadata(bytes, normalized, title)

    if (!patched) return blob
    const outBuffer = patched.buffer.slice(
      patched.byteOffset,
      patched.byteOffset + patched.byteLength
    ) as ArrayBuffer
    return new Blob([outBuffer], { type: blob.type })
  } catch {
    return blob
  }
}

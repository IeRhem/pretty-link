export interface ZipFileEntry {
  name: string
  data: Uint8Array
}

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

function getDosDateTime(date = new Date()): { dosTime: number; dosDate: number } {
  const year = Math.max(1980, date.getFullYear())
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const seconds = Math.floor(date.getSeconds() / 2)

  const dosTime = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f)
  const dosDate =
    (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f)
  return { dosTime, dosDate }
}

/**
 * Builds a standard uncompressed (Store method 0) ZIP archive from in-memory files.
 * Since PNG, JPEG, and WebP images are already compressed, Store avoids re-compression overhead.
 */
export function createZipBytes(
  entries: ZipFileEntry[],
  now = new Date()
): Uint8Array {
  const encoder = new TextEncoder()
  const { dosTime, dosDate } = getDosDateTime(now)

  const prepared = entries.map((entry) => {
    const safeName = entry.name.replace(/^\/+/, "") || "file"
    const nameBytes = encoder.encode(safeName)
    const crc = crc32(entry.data)
    return {
      nameBytes,
      data: entry.data,
      crc,
    }
  })

  let localTotalSize = 0
  let centralTotalSize = 0
  for (const item of prepared) {
    localTotalSize += 30 + item.nameBytes.length + item.data.length
    centralTotalSize += 46 + item.nameBytes.length
  }

  const totalSize = localTotalSize + centralTotalSize + 22
  const out = new Uint8Array(totalSize)
  const view = new DataView(out.buffer)

  let localOffset = 0
  const fileOffsets: number[] = []

  // 1. Local file headers + file payloads
  for (const item of prepared) {
    fileOffsets.push(localOffset)
    // Local file header signature (0x04034b50)
    view.setUint32(localOffset, 0x04034b50, true)
    // Version needed to extract (2.0)
    view.setUint16(localOffset + 4, 20, true)
    // General purpose bit flag (bit 11 = UTF-8 filename)
    view.setUint16(localOffset + 6, 0x0800, true)
    // Compression method (0 = Store)
    view.setUint16(localOffset + 8, 0, true)
    // Last mod file time & date
    view.setUint16(localOffset + 10, dosTime, true)
    view.setUint16(localOffset + 12, dosDate, true)
    // CRC-32
    view.setUint32(localOffset + 14, item.crc, true)
    // Compressed size & uncompressed size
    view.setUint32(localOffset + 18, item.data.length, true)
    view.setUint32(localOffset + 22, item.data.length, true)
    // File name length & extra field length
    view.setUint16(localOffset + 26, item.nameBytes.length, true)
    view.setUint16(localOffset + 28, 0, true)

    out.set(item.nameBytes, localOffset + 30)
    out.set(item.data, localOffset + 30 + item.nameBytes.length)
    localOffset += 30 + item.nameBytes.length + item.data.length
  }

  const centralDirStart = localOffset
  let centralOffset = centralDirStart

  // 2. Central directory headers
  for (let i = 0; i < prepared.length; i++) {
    const item = prepared[i]!
    const fileOffset = fileOffsets[i]!
    // Central directory file header signature (0x02014b50)
    view.setUint32(centralOffset, 0x02014b50, true)
    // Version made by & version needed to extract
    view.setUint16(centralOffset + 4, 20, true)
    view.setUint16(centralOffset + 6, 20, true)
    // General purpose bit flag (UTF-8)
    view.setUint16(centralOffset + 8, 0x0800, true)
    // Compression method (0 = Store)
    view.setUint16(centralOffset + 10, 0, true)
    // Last mod file time & date
    view.setUint16(centralOffset + 12, dosTime, true)
    view.setUint16(centralOffset + 14, dosDate, true)
    // CRC-32
    view.setUint32(centralOffset + 16, item.crc, true)
    // Compressed & uncompressed size
    view.setUint32(centralOffset + 20, item.data.length, true)
    view.setUint32(centralOffset + 24, item.data.length, true)
    // File name length, extra field length, file comment length
    view.setUint16(centralOffset + 28, item.nameBytes.length, true)
    view.setUint16(centralOffset + 30, 0, true)
    view.setUint16(centralOffset + 32, 0, true)
    // Disk number start, internal & external file attributes
    view.setUint16(centralOffset + 34, 0, true)
    view.setUint16(centralOffset + 36, 0, true)
    view.setUint32(centralOffset + 38, 0, true)
    // Relative offset of local header
    view.setUint32(centralOffset + 42, fileOffset, true)

    out.set(item.nameBytes, centralOffset + 46)
    centralOffset += 46 + item.nameBytes.length
  }

  // 3. End of Central Directory (EOCD) record (0x06054b50)
  view.setUint32(centralOffset, 0x06054b50, true)
  view.setUint16(centralOffset + 4, 0, true) // Number of this disk
  view.setUint16(centralOffset + 6, 0, true) // Disk where central directory starts
  view.setUint16(centralOffset + 8, prepared.length, true) // Entries on this disk
  view.setUint16(centralOffset + 10, prepared.length, true) // Total entries
  view.setUint32(centralOffset + 12, centralTotalSize, true) // Size of central directory
  view.setUint32(centralOffset + 16, centralDirStart, true) // Offset of central directory
  view.setUint16(centralOffset + 20, 0, true) // Comment length

  return out
}

export function createZipBlob(entries: ZipFileEntry[]): Blob {
  const bytes = createZipBytes(entries)
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/zip" })
}

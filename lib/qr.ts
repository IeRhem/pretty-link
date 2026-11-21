/**
 * Self-contained Byte-mode QR Code matrix generator (ISO/IEC 18004, Versions 1-6, ECC Level M).
 * Zero external dependencies, deterministic output for SVG and HTML5 Canvas rendering.
 */

interface VersionSpec {
  version: number
  size: number
  dataCodewords: number
  ecPerBlock: number
  blocks: number
  dataPerBlock: number
  alignmentCenters: number[]
}

const VERSION_SPECS: VersionSpec[] = [
  { version: 1, size: 21, dataCodewords: 16, ecPerBlock: 10, blocks: 1, dataPerBlock: 16, alignmentCenters: [] },
  { version: 2, size: 25, dataCodewords: 28, ecPerBlock: 16, blocks: 1, dataPerBlock: 28, alignmentCenters: [6, 18] },
  { version: 3, size: 29, dataCodewords: 44, ecPerBlock: 26, blocks: 1, dataPerBlock: 44, alignmentCenters: [6, 22] },
  { version: 4, size: 33, dataCodewords: 64, ecPerBlock: 18, blocks: 2, dataPerBlock: 32, alignmentCenters: [6, 26] },
  { version: 5, size: 37, dataCodewords: 86, ecPerBlock: 24, blocks: 2, dataPerBlock: 43, alignmentCenters: [6, 30] },
  { version: 6, size: 41, dataCodewords: 108, ecPerBlock: 16, blocks: 4, dataPerBlock: 27, alignmentCenters: [6, 34] },
]

// GF(256) with primitive polynomial 0x11D
const GF_EXP = new Uint8Array(512)
const GF_LOG = new Uint8Array(256)
{
  let x = 1
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x
    GF_LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255]!
  }
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1])
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1)
    const factor = GF_EXP[i]!
    for (let j = 0; j < poly.length; j++) {
      next[j]! ^= poly[j]!
      next[j + 1]! ^= gfMul(poly[j]!, factor)
    }
    poly = next
  }
  return poly
}

function computeEcc(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGeneratorPoly(ecCount)
  const work = new Uint8Array(data.length + ecCount)
  work.set(data)
  for (let i = 0; i < data.length; i++) {
    const coef = work[i]!
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        work[i + j]! ^= gfMul(gen[j]!, coef)
      }
    }
  }
  return work.slice(data.length)
}

function pickVersionAndBytes(text: string): { spec: VersionSpec; bytes: Uint8Array } {
  const encoded = new TextEncoder().encode(text || "https://www.lerhem.space")
  // Max capacity at V6-M Byte mode is 106 bytes (108 data codewords - 12 bits header)
  const clamped = encoded.length > 106 ? encoded.slice(0, 106) : encoded

  for (const spec of VERSION_SPECS) {
    const capacityBytes = Math.floor((spec.dataCodewords * 8 - 12) / 8)
    if (clamped.length <= capacityBytes) {
      return { spec, bytes: clamped }
    }
  }
  return { spec: VERSION_SPECS[VERSION_SPECS.length - 1]!, bytes: clamped }
}

function encodeCodewords(spec: VersionSpec, bytes: Uint8Array): Uint8Array {
  const bits: number[] = []
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >> i) & 1)
    }
  }

  // Byte mode (0100) + 8-bit length
  pushBits(0b0100, 4)
  pushBits(bytes.length, 8)
  for (const b of bytes) {
    pushBits(b, 8)
  }

  const maxDataBits = spec.dataCodewords * 8
  const terminatorLen = Math.min(4, maxDataBits - bits.length)
  for (let i = 0; i < terminatorLen; i++) bits.push(0)
  while (bits.length % 8 !== 0) bits.push(0)

  const dataBytes = new Uint8Array(spec.dataCodewords)
  let byteIdx = 0
  for (let i = 0; i < bits.length; i += 8) {
    let val = 0
    for (let j = 0; j < 8; j++) val = (val << 1) | (bits[i + j] ?? 0)
    dataBytes[byteIdx++] = val
  }

  const padBytes = [0xec, 0x11]
  let padIdx = 0
  while (byteIdx < spec.dataCodewords) {
    dataBytes[byteIdx++] = padBytes[padIdx % 2]!
    padIdx++
  }

  const dataBlocks: Uint8Array[] = []
  const ecBlocks: Uint8Array[] = []
  for (let b = 0; b < spec.blocks; b++) {
    const start = b * spec.dataPerBlock
    const blockData = dataBytes.slice(start, start + spec.dataPerBlock)
    dataBlocks.push(blockData)
    ecBlocks.push(computeEcc(blockData, spec.ecPerBlock))
  }

  const interleaved = new Uint8Array(
    spec.dataCodewords + spec.blocks * spec.ecPerBlock
  )
  let out = 0
  for (let i = 0; i < spec.dataPerBlock; i++) {
    for (let b = 0; b < spec.blocks; b++) {
      interleaved[out++] = dataBlocks[b]![i]!
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (let b = 0; b < spec.blocks; b++) {
      interleaved[out++] = ecBlocks[b]![i]!
    }
  }
  return interleaved
}

function drawFinderPattern(
  modules: boolean[][],
  reserved: boolean[][],
  row: number,
  col: number
) {
  const size = modules.length
  for (let dy = -1; dy <= 7; dy++) {
    for (let dx = -1; dx <= 7; dx++) {
      const r = row + dy
      const c = col + dx
      if (r < 0 || r >= size || c < 0 || c >= size) continue
      reserved[r]![c] = true
      const inOuter = dy >= 0 && dy <= 6 && dx >= 0 && dx <= 6
      const onRing =
        inOuter && (dy === 0 || dy === 6 || dx === 0 || dx === 6)
      const inCenter = dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4
      modules[r]![c] = onRing || inCenter
    }
  }
}

function drawAlignmentPattern(
  modules: boolean[][],
  reserved: boolean[][],
  centerR: number,
  centerC: number
) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const r = centerR + dy
      const c = centerC + dx
      reserved[r]![c] = true
      const dist = Math.max(Math.abs(dy), Math.abs(dx))
      modules[r]![c] = dist === 0 || dist === 2
    }
  }
}

function buildBaseMatrix(spec: VersionSpec): {
  modules: boolean[][]
  reserved: boolean[][]
} {
  const size = spec.size
  const modules = Array.from({ length: size }, () => Array<boolean>(size).fill(false))
  const reserved = Array.from({ length: size }, () => Array<boolean>(size).fill(false))

  drawFinderPattern(modules, reserved, 0, 0)
  drawFinderPattern(modules, reserved, 0, size - 7)
  drawFinderPattern(modules, reserved, size - 7, 0)

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0
    modules[6]![i] = dark
    reserved[6]![i] = true
    modules[i]![6] = dark
    reserved[i]![6] = true
  }

  // Alignment patterns (skip corners overlapping finder patterns)
  for (const r of spec.alignmentCenters) {
    for (const c of spec.alignmentCenters) {
      if (reserved[r]![c]) continue
      drawAlignmentPattern(modules, reserved, r, c)
    }
  }

  // Dark module
  modules[4 * spec.version + 9]![8] = true
  reserved[4 * spec.version + 9]![8] = true

  // Reserve format info coordinates
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      reserved[8]![i] = true
      reserved[i]![8] = true
    }
  }
  for (let i = size - 8; i < size; i++) {
    reserved[8]![i] = true
    reserved[i]![8] = true
  }

  return { modules, reserved }
}

function placeDataBits(
  modules: boolean[][],
  reserved: boolean[][],
  codewords: Uint8Array
) {
  const size = modules.length
  let bitIndex = 0
  const totalBits = codewords.length * 8
  let upward = true

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let step = 0; step < size; step++) {
      const r = upward ? size - 1 - step : step
      for (const c of [right, right - 1]) {
        if (reserved[r]![c]) continue
        let dark = false
        if (bitIndex < totalBits) {
          const byte = codewords[bitIndex >> 3]!
          dark = ((byte >> (7 - (bitIndex & 7))) & 1) === 1
          bitIndex++
        }
        modules[r]![c] = dark
      }
    }
    upward = !upward
  }
}

function maskCondition(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0:
      return (r + c) % 2 === 0
    case 1:
      return r % 2 === 0
    case 2:
      return c % 3 === 0
    case 3:
      return (r + c) % 3 === 0
    case 4:
      return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0
    case 5:
      return ((r * c) % 2) + ((r * c) % 3) === 0
    case 6:
      return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0
    default:
      return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
  }
}

function computeFormatBits(mask: number): number {
  // Error Correction Level M = 00
  const data = (0b00 << 3) | mask
  let rem = data << 10
  const poly = 0b10100110111
  for (let bit = 14; bit >= 10; bit--) {
    if ((rem >> bit) & 1) {
      rem ^= poly << (bit - 10)
    }
  }
  return ((data << 10) | rem) ^ 0b101010000010010
}

function applyFormatInfo(modules: boolean[][], mask: number) {
  const size = modules.length
  const format = computeFormatBits(mask)
  for (let i = 0; i < 15; i++) {
    const dark = ((format >> i) & 1) === 1
    // Vertical strip
    if (i < 6) {
      modules[i]![8] = dark
    } else if (i < 8) {
      modules[i + 1]![8] = dark
    } else {
      modules[size - 15 + i]![8] = dark
    }
    // Horizontal strip
    if (i < 8) {
      modules[8]![size - 1 - i] = dark
    } else if (i < 9) {
      modules[8]![15 - i] = dark
    } else {
      modules[8]![14 - i] = dark
    }
  }
}

function penaltyScore(modules: boolean[][]): number {
  const size = modules.length
  let score = 0

  // Rule 1: runs of 5+ same color
  for (let r = 0; r < size; r++) {
    let runColor = modules[r]![0]!
    let runLen = 1
    for (let c = 1; c < size; c++) {
      if (modules[r]![c] === runColor) {
        runLen++
      } else {
        if (runLen >= 5) score += 3 + (runLen - 5)
        runColor = modules[r]![c]!
        runLen = 1
      }
    }
    if (runLen >= 5) score += 3 + (runLen - 5)
  }
  for (let c = 0; c < size; c++) {
    let runColor = modules[0]![c]!
    let runLen = 1
    for (let r = 1; r < size; r++) {
      if (modules[r]![c] === runColor) {
        runLen++
      } else {
        if (runLen >= 5) score += 3 + (runLen - 5)
        runColor = modules[r]![c]!
        runLen = 1
      }
    }
    if (runLen >= 5) score += 3 + (runLen - 5)
  }

  // Rule 2: 2x2 blocks
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = modules[r]![c]
      if (
        v === modules[r]![c + 1] &&
        v === modules[r + 1]![c] &&
        v === modules[r + 1]![c + 1]
      ) {
        score += 3
      }
    }
  }

  return score
}

export function generateQrMatrix(value: string): boolean[][] {
  const { spec, bytes } = pickVersionAndBytes(value)
  const codewords = encodeCodewords(spec, bytes)
  const { modules: baseModules, reserved } = buildBaseMatrix(spec)
  placeDataBits(baseModules, reserved, codewords)

  let bestMatrix: boolean[][] | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (let mask = 0; mask < 8; mask++) {
    const candidate = baseModules.map((row, r) =>
      row.map((val, c) =>
        reserved[r]![c] ? val : maskCondition(mask, r, c) ? !val : val
      )
    )
    applyFormatInfo(candidate, mask)
    const s = penaltyScore(candidate)
    if (s < bestScore) {
      bestScore = s
      bestMatrix = candidate
    }
  }

  return bestMatrix ?? baseModules
}

import { deflateSync, inflateSync } from 'node:zlib'

/**
 * Just enough PNG to read the brand logo and write app icons, with no
 * dependencies — the alternative is asking everyone who touches the artwork to
 * install a native image library.
 *
 * Reads 8-bit greyscale, RGB, palette and alpha variants, non-interlaced.
 * Anything else throws with a message that says how to re-export.
 */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('Not a PNG file.')

  let pos = 8
  let width = 0
  let height = 0
  let depth = 0
  let colorType = 0
  let palette = null
  let transparency = null
  const idat = []

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    pos += 12 + len

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      depth = data[8]
      colorType = data[9]
      if (data[12] !== 0) throw new Error('Interlaced PNG — re-export without interlacing.')
    } else if (type === 'PLTE') palette = Buffer.from(data)
    else if (type === 'tRNS') transparency = Buffer.from(data)
    else if (type === 'IDAT') idat.push(Buffer.from(data))
    else if (type === 'IEND') break
  }

  if (depth !== 8) throw new Error(`${depth}-bit PNG — re-export at 8 bits per channel.`)

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]
  if (!channels) throw new Error(`Unsupported PNG colour type ${colorType}.`)

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const bytes = unfilter(raw, width, height, channels, stride)

  // Normalise everything to straight RGBA.
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const s = i * channels
    const d = i * 4
    let r = 0
    let g = 0
    let b = 0
    let a = 255
    if (colorType === 0) {
      r = g = b = bytes[s]
    } else if (colorType === 4) {
      r = g = b = bytes[s]
      a = bytes[s + 1]
    } else if (colorType === 2) {
      r = bytes[s]
      g = bytes[s + 1]
      b = bytes[s + 2]
    } else if (colorType === 6) {
      r = bytes[s]
      g = bytes[s + 1]
      b = bytes[s + 2]
      a = bytes[s + 3]
    } else {
      const idx = bytes[s]
      r = palette[idx * 3]
      g = palette[idx * 3 + 1]
      b = palette[idx * 3 + 2]
      if (transparency && idx < transparency.length) a = transparency[idx]
    }
    rgba[d] = r
    rgba[d + 1] = g
    rgba[d + 2] = b
    rgba[d + 3] = a
  }
  return { width, height, data: rgba }
}

function unfilter(raw, width, height, channels, stride) {
  const out = new Uint8Array(height * stride)
  let rp = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++]
    const row = y * stride
    const prev = row - stride
    for (let x = 0; x < stride; x++) {
      const value = raw[rp++]
      const a = x >= channels ? out[row + x - channels] : 0
      const b = y > 0 ? out[prev + x] : 0
      const c = x >= channels && y > 0 ? out[prev + x - channels] : 0
      let add = 0
      if (filter === 1) add = a
      else if (filter === 2) add = b
      else if (filter === 3) add = (a + b) >> 1
      else if (filter === 4) add = paeth(a, b, c)
      out[row + x] = (value + add) & 0xff
    }
  }
  return out
}

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

export function encodePng(rgba, width, height) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0, 0)
  return Buffer.concat([len, body, crc])
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return c ^ -1
}

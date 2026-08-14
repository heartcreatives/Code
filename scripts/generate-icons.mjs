/**
 * Generates the PWA icons — a court seen from above, with a pickleball on it —
 * as PNGs, with no image dependencies. Run with `npm run icons` after changing
 * the artwork; the output is committed so builds don't need to regenerate it.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

const COURT = [14, 75, 69]
const DEEP = [8, 51, 47]
const LINE = [235, 240, 233]
const OPTIC = [199, 230, 63]

function canvas(size, bg) {
  const px = new Uint8Array(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    px[i * 4] = bg[0]
    px[i * 4 + 1] = bg[1]
    px[i * 4 + 2] = bg[2]
    px[i * 4 + 3] = 255
  }
  return px
}

function blend(px, size, x, y, color, alpha) {
  if (x < 0 || y < 0 || x >= size || y >= size || alpha <= 0) return
  const i = (Math.floor(y) * size + Math.floor(x)) * 4
  const a = Math.min(1, alpha)
  for (let c = 0; c < 3; c++) px[i + c] = Math.round(px[i + c] * (1 - a) + color[c] * a)
}

function rect(px, size, x0, y0, x1, y1, color, alpha = 1) {
  for (let y = Math.round(y0); y < Math.round(y1); y++) {
    for (let x = Math.round(x0); x < Math.round(x1); x++) blend(px, size, x, y, color, alpha)
  }
}

function strokeRect(px, size, x0, y0, x1, y1, w, color, alpha = 1) {
  rect(px, size, x0, y0, x1, y0 + w, color, alpha)
  rect(px, size, x0, y1 - w, x1, y1, color, alpha)
  rect(px, size, x0, y0, x0 + w, y1, color, alpha)
  rect(px, size, x1 - w, y0, x1, y1, color, alpha)
}

function disc(px, size, cx, cy, r, color) {
  for (let y = Math.floor(cy - r) - 1; y <= Math.ceil(cy + r) + 1; y++) {
    for (let x = Math.floor(cx - r) - 1; x <= Math.ceil(cx + r) + 1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      if (d <= r - 0.5) blend(px, size, x, y, color, 1)
      else if (d < r + 0.5) blend(px, size, x, y, color, r + 0.5 - d) // soft edge
    }
  }
}

/** @param {number} size @param {number} inset fraction kept clear for maskable safe zone */
function draw(size, inset) {
  const px = canvas(size, COURT)
  const pad = size * inset
  const w = size - pad * 2
  const h = w * 0.62
  const top = (size - h) / 2
  const line = Math.max(2, Math.round(size * 0.014))

  // court surface, a shade deeper than the background
  rect(px, size, pad, top, pad + w, top + h, DEEP, 0.5)
  strokeRect(px, size, pad, top, pad + w, top + h, line, LINE, 0.9)
  // net
  rect(px, size, size / 2 - line / 2, top - h * 0.06, size / 2 + line / 2, top + h * 1.06, LINE, 0.95)
  // kitchen lines
  rect(px, size, pad + w * 0.33, top, pad + w * 0.33 + line, top + h, LINE, 0.75)
  rect(px, size, pad + w * 0.67 - line, top, pad + w * 0.67, top + h, LINE, 0.75)
  // service lines
  rect(px, size, pad, top + h / 2 - line / 2, pad + w * 0.33, top + h / 2 + line / 2, LINE, 0.6)
  rect(px, size, pad + w * 0.67, top + h / 2 - line / 2, pad + w, top + h / 2 + line / 2, LINE, 0.6)

  // the ball
  const r = size * 0.115
  const cx = pad + w * 0.78
  const cy = top + h * 0.26
  disc(px, size, cx, cy, r, OPTIC)
  // its holes
  const hole = r * 0.19
  for (const [dx, dy] of [
    [-0.42, -0.34],
    [0.36, -0.4],
    [0, 0.02],
    [-0.45, 0.38],
    [0.42, 0.34],
  ]) {
    disc(px, size, cx + dx * r * 1.4, cy + dy * r * 1.4, hole, DEEP)
  }
  return px
}

function png(px, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1)
  }
  const chunks = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr(size)),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]
  return Buffer.concat(chunks)
}

function ihdr(size) {
  const b = Buffer.alloc(13)
  b.writeUInt32BE(size, 0)
  b.writeUInt32BE(size, 4)
  b[8] = 8 // bit depth
  b[9] = 6 // truecolour with alpha
  return b
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

mkdirSync(OUT, { recursive: true })
const files = [
  ['icon-192.png', 192, 0.1],
  ['icon-512.png', 512, 0.1],
  ['maskable-512.png', 512, 0.2], // extra inset for the safe zone
  ['apple-touch-icon.png', 180, 0.1],
]
for (const [name, size, inset] of files) {
  writeFileSync(join(OUT, name), png(draw(size, inset), size))
  console.log(`wrote public/icons/${name} (${size}×${size})`)
}

/**
 * Builds the PWA icons.
 *
 * If `public/logo.png` exists the real badge is used: the white background is
 * flood-filled away from the edges (so the white lettering *inside* the badge
 * survives), the artwork is trimmed to its own bounds, scaled, and composited
 * on the app's charcoal. Otherwise it falls back to drawing a court, so the
 * repo always has usable icons.
 *
 * Run with `npm run icons`. Output is committed — builds don't regenerate it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng, encodePng } from './lib/png.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'icons')
const LOGO = join(ROOT, 'public', 'logo.png')

// Pikol sa Paayo: navy court on charcoal, sky lines, orange ball.
const COURT = [11, 41, 66]
const DEEP = [23, 25, 28]
const LINE = [85, 184, 232]
const BALL = [245, 130, 32]

const FILES = [
  ['icon-192.png', 192, 0.1],
  ['icon-512.png', 512, 0.1],
  ['maskable-512.png', 512, 0.2], // extra inset for the maskable safe zone
  ['apple-touch-icon.png', 180, 0.1],
]

// ---------------------------------------------------------------------------
// Raster helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Path A — the real badge
// ---------------------------------------------------------------------------

const NEAR_WHITE = 240

const isNearWhite = (d, i) =>
  d[i + 3] > 8 && d[i] >= NEAR_WHITE && d[i + 1] >= NEAR_WHITE && d[i + 2] >= NEAR_WHITE

/**
 * Clear the white *surround* only. Flooding inward from the border means the
 * white letterforms inside the badge are never reached, so they stay.
 */
function knockoutBackground({ width, height, data }) {
  const seen = new Uint8Array(width * height)
  const stack = []

  for (let x = 0; x < width; x++) {
    stack.push([x, 0], [x, height - 1])
  }
  for (let y = 0; y < height; y++) {
    stack.push([0, y], [width - 1, y])
  }

  while (stack.length) {
    const [x, y] = stack.pop()
    if (x < 0 || y < 0 || x >= width || y >= height) continue
    const p = y * width + x
    if (seen[p]) continue
    const i = p * 4
    if (!isNearWhite(data, i) && data[i + 3] > 8) continue
    seen[p] = 1
    data[i + 3] = 0
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
  }

  // Second pass: the anti-aliased halo the flood fill stops short of.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const i = p * 4
      if (data[i + 3] === 0) continue
      const luma = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000
      if (luma < 215) continue
      let clear = 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        if (data[(ny * width + nx) * 4 + 3] === 0) clear++
      }
      if (clear >= 2) data[i + 3] = 0
    }
  }
  return { width, height, data }
}

/** Crop to what is actually drawn, so the badge fills the icon. */
function trim({ width, height, data }) {
  let top = height
  let left = width
  let right = -1
  let bottom = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 12) {
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }
  }
  if (right < 0) return { width, height, data }

  const w = right - left + 1
  const h = bottom - top + 1
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    const src = ((y + top) * width + left) * 4
    out.set(data.subarray(src, src + w * 4), y * w * 4)
  }
  return { width: w, height: h, data: out }
}

/** Area-average resample — the source is far larger than any icon. */
function resize({ width, height, data }, w, h) {
  const out = new Uint8Array(w * h * 4)
  const xRatio = width / w
  const yRatio = height / h

  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * yRatio)
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * yRatio))
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * xRatio)
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * xRatio))
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let n = 0
      for (let sy = y0; sy < y1 && sy < height; sy++) {
        for (let sx = x0; sx < x1 && sx < width; sx++) {
          const i = (sy * width + sx) * 4
          const alpha = data[i + 3] / 255
          // Premultiply, so transparent pixels don't drag colour into the edge.
          r += data[i] * alpha
          g += data[i + 1] * alpha
          b += data[i + 2] * alpha
          a += data[i + 3]
          n++
        }
      }
      const d = (y * w + x) * 4
      const alphaAvg = a / n
      const weight = alphaAvg / 255
      out[d] = weight > 0 ? Math.round(r / n / weight) : 0
      out[d + 1] = weight > 0 ? Math.round(g / n / weight) : 0
      out[d + 2] = weight > 0 ? Math.round(b / n / weight) : 0
      out[d + 3] = Math.round(alphaAvg)
    }
  }
  return { width: w, height: h, data: out }
}

function fromLogo(source, size, inset) {
  const px = canvas(size, DEEP)
  const box = Math.round(size * (1 - inset * 2))
  const scale = Math.min(box / source.width, box / source.height)
  const w = Math.max(1, Math.round(source.width * scale))
  const h = Math.max(1, Math.round(source.height * scale))
  const art = resize(source, w, h)
  const ox = Math.round((size - w) / 2)
  const oy = Math.round((size - h) / 2)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      blend(px, size, ox + x, oy + y, [art.data[i], art.data[i + 1], art.data[i + 2]], art.data[i + 3] / 255)
    }
  }
  return px
}

// ---------------------------------------------------------------------------
// Path B — the drawn fallback
// ---------------------------------------------------------------------------

function drawCourt(size, inset) {
  const px = canvas(size, DEEP)
  const pad = size * inset
  const w = size - pad * 2
  const h = w * 0.62
  const top = (size - h) / 2
  const line = Math.max(2, Math.round(size * 0.014))

  rect(px, size, pad, top, pad + w, top + h, COURT, 1)
  strokeRect(px, size, pad, top, pad + w, top + h, line, LINE, 0.9)
  rect(px, size, size / 2 - line / 2, top - h * 0.06, size / 2 + line / 2, top + h * 1.06, LINE, 0.95)
  rect(px, size, pad + w * 0.33, top, pad + w * 0.33 + line, top + h, LINE, 0.75)
  rect(px, size, pad + w * 0.67 - line, top, pad + w * 0.67, top + h, LINE, 0.75)
  rect(px, size, pad, top + h / 2 - line / 2, pad + w * 0.33, top + h / 2 + line / 2, LINE, 0.6)
  rect(px, size, pad + w * 0.67, top + h / 2 - line / 2, pad + w, top + h / 2 + line / 2, LINE, 0.6)

  const r = size * 0.115
  const cx = pad + w * 0.78
  const cy = top + h * 0.26
  disc(px, size, cx, cy, r, BALL)
  const hole = r * 0.19
  for (const [dx, dy] of [
    [-0.42, -0.34],
    [0.36, -0.4],
    [0, 0.02],
    [-0.45, 0.38],
    [0.42, 0.34],
  ]) {
    disc(px, size, cx + dx * r * 1.4, cy + dy * r * 1.4, hole, COURT)
  }
  return px
}

// ---------------------------------------------------------------------------

mkdirSync(OUT, { recursive: true })

let source = null
if (existsSync(LOGO)) {
  try {
    source = trim(knockoutBackground(decodePng(readFileSync(LOGO))))
    console.log(`using public/logo.png (trimmed to ${source.width}×${source.height})`)
  } catch (err) {
    console.error(`could not read public/logo.png — ${err.message}`)
    console.error('falling back to the drawn court icon')
  }
} else {
  console.log('no public/logo.png — drawing the fallback court icon')
}

for (const [name, size, inset] of FILES) {
  const px = source ? fromLogo(source, size, inset) : drawCourt(size, inset)
  writeFileSync(join(OUT, name), encodePng(px, size, size))
  console.log(`wrote public/icons/${name} (${size}×${size})`)
}

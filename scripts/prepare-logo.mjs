/**
 * Turns a source badge image into the file the app ships: background removed,
 * trimmed to the artwork, and scaled down to a size a phone on court wifi will
 * not resent downloading.
 *
 *   npm run logo -- path/to/badge.png
 *
 * The background colour is sampled from the corners rather than assumed, so a
 * white export and a charcoal one both work. Only the surround is removed —
 * the fill runs inward from the edges and stops at the badge's ring, so the
 * white lettering inside survives.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng, encodePng } from './lib/png.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'logo.png')
const SIZE = 512 // the sign-in badge renders at ~148px CSS; 512 covers 3× screens

const source = process.argv[2]
if (!source) {
  console.error('usage: npm run logo -- <path-to-image.png>')
  process.exit(1)
}

const TOLERANCE = 26

const near = (d, i, [r, g, b]) =>
  Math.abs(d[i] - r) <= TOLERANCE &&
  Math.abs(d[i + 1] - g) <= TOLERANCE &&
  Math.abs(d[i + 2] - b) <= TOLERANCE

/** The most common of the four corners — safest guess at the backdrop. */
function sampleBackground({ width, height, data }) {
  const corners = [
    [2, 2],
    [width - 3, 2],
    [2, height - 3],
    [width - 3, height - 3],
  ].map(([x, y]) => {
    const i = (y * width + x) * 4
    return [data[i], data[i + 1], data[i + 2]]
  })

  let best = corners[0]
  let bestCount = 0
  for (const c of corners) {
    const count = corners.filter(
      (o) => Math.abs(o[0] - c[0]) <= TOLERANCE && Math.abs(o[1] - c[1]) <= TOLERANCE && Math.abs(o[2] - c[2]) <= TOLERANCE,
    ).length
    if (count > bestCount) {
      best = c
      bestCount = count
    }
  }
  return best
}

function knockout(img, bg) {
  const { width, height, data } = img
  const seen = new Uint8Array(width * height)
  const stack = []
  for (let x = 0; x < width; x++) stack.push([x, 0], [x, height - 1])
  for (let y = 0; y < height; y++) stack.push([0, y], [width - 1, y])

  while (stack.length) {
    const [x, y] = stack.pop()
    if (x < 0 || y < 0 || x >= width || y >= height) continue
    const p = y * width + x
    if (seen[p]) continue
    const i = p * 4
    if (data[i + 3] > 8 && !near(data, i, bg)) continue
    seen[p] = 1
    data[i + 3] = 0
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
  }

  // Soften the anti-aliased rim the flood fill stops one pixel short of.
  const alpha = new Uint8Array(width * height)
  for (let p = 0; p < width * height; p++) alpha[p] = data[p * 4 + 3]
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const p = y * width + x
      if (alpha[p] === 0) continue
      const i = p * 4
      let clear = 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (alpha[(y + dy) * width + (x + dx)] === 0) clear++
      }
      // A pixel on the boundary that still looks like the backdrop is halo.
      if (clear > 0 && near(data, i, bg)) data[i + 3] = 0
      else if (clear >= 2) data[i + 3] = Math.min(data[i + 3], 190)
    }
  }
  return img
}

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

/** Area-average, premultiplied so transparency doesn't bleed dark edges. */
function resize({ width, height, data }, w, h) {
  const out = new Uint8Array(w * h * 4)
  const xr = width / w
  const yr = height / h
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * yr)
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * yr))
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * xr)
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * xr))
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let n = 0
      for (let sy = y0; sy < y1 && sy < height; sy++) {
        for (let sx = x0; sx < x1 && sx < width; sx++) {
          const i = (sy * width + sx) * 4
          const al = data[i + 3] / 255
          r += data[i] * al
          g += data[i + 1] * al
          b += data[i + 2] * al
          a += data[i + 3]
          n++
        }
      }
      const d = (y * w + x) * 4
      const avg = a / n
      const wgt = avg / 255
      out[d] = wgt > 0 ? Math.min(255, Math.round(r / n / wgt)) : 0
      out[d + 1] = wgt > 0 ? Math.min(255, Math.round(g / n / wgt)) : 0
      out[d + 2] = wgt > 0 ? Math.min(255, Math.round(b / n / wgt)) : 0
      out[d + 3] = Math.round(avg)
    }
  }
  return { width: w, height: h, data: out }
}

const img = decodePng(readFileSync(source))
const bg = sampleBackground(img)
console.log(`source ${img.width}×${img.height}, backdrop rgb(${bg.join(', ')})`)

const cut = trim(knockout(img, bg))
console.log(`trimmed to ${cut.width}×${cut.height}`)

const scale = Math.min(SIZE / cut.width, SIZE / cut.height)
const final = resize(cut, Math.round(cut.width * scale), Math.round(cut.height * scale))
writeFileSync(OUT, encodePng(final.data, final.width, final.height))
console.log(`wrote public/logo.png (${final.width}×${final.height})`)

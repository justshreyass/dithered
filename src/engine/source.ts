// A Source is the tone-prepared photo every effect reads from.
// Luma is normalised brightness (0 = black, 1 = white) after auto-levels and
// a little local contrast, which is what makes dithers of faces read well.

export interface Source {
  w: number
  h: number
  /** Unit pixel scale: 1 at a 1200px short side. Effects size cells with it. */
  s: number
  luma: Float32Array
  /** Tone-adjusted RGBA, used by the colour effects. */
  rgba: Uint8ClampedArray
  blurred(radius: number): Float32Array
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export function smoothstep(a: number, b: number, x: number) {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** Separable box blur, run twice for a near-Gaussian falloff. */
export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  r = Math.max(1, Math.round(r))
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  blurAxis(src, tmp, w, h, r, true)
  blurAxis(tmp, out, w, h, r, false)
  blurAxis(out, tmp, w, h, r, true)
  blurAxis(tmp, out, w, h, r, false)
  return out
}

function blurAxis(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, horizontal: boolean) {
  const len = horizontal ? w : h
  const lines = horizontal ? h : w
  const step = horizontal ? 1 : w
  const norm = 1 / (2 * r + 1)
  for (let line = 0; line < lines; line++) {
    const base = horizontal ? line * w : line
    let acc = 0
    for (let k = -r; k <= r; k++) acc += src[base + Math.min(len - 1, Math.max(0, k)) * step]
    for (let i = 0; i < len; i++) {
      dst[base + i * step] = acc * norm
      const add = Math.min(len - 1, i + r + 1)
      const sub = Math.max(0, i - r)
      acc += src[base + add * step] - src[base + sub * step]
    }
  }
}

export function buildSource(image: CanvasImageSource, w: number, h: number, s = Math.min(w, h) / 1200): Source {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data
  const n = w * h

  // Rec. 709 luma + histogram for auto-levels.
  const raw = new Float32Array(n)
  const hist = new Uint32Array(256)
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const y = 0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2]
    raw[i] = y / 255
    hist[y | 0]++
  }
  const lo = percentile(hist, n, 0.006) / 255
  const hi = Math.max(lo + 0.1, percentile(hist, n, 0.994) / 255)
  const span = 1 / (hi - lo)

  const levelled = new Float32Array(n)
  for (let i = 0; i < n; i++) levelled[i] = clamp01((raw[i] - lo) * span)

  // Local contrast ("clarity") pulls features out of flat skin tones.
  const wide = boxBlur(levelled, w, h, Math.min(w, h) * 0.035)
  const luma = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const v = levelled[i] + 0.45 * (levelled[i] - wide[i])
    // gentle S-curve
    const c = clamp01(v)
    luma[i] = clamp01(c + 0.18 * (c - 0.5) * (1 - Math.abs(2 * c - 1)) * 2)
  }

  const rgba = new Uint8ClampedArray(data.length)
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    rgba[j] = (data[j] / 255 - lo) * span * 255
    rgba[j + 1] = (data[j + 1] / 255 - lo) * span * 255
    rgba[j + 2] = (data[j + 2] / 255 - lo) * span * 255
    rgba[j + 3] = 255
  }

  const cache = new Map<number, Float32Array>()
  return {
    w,
    h,
    s,
    luma,
    rgba,
    blurred(radius) {
      const r = Math.max(1, Math.round(radius))
      let hit = cache.get(r)
      if (!hit) {
        hit = boxBlur(luma, w, h, r)
        cache.set(r, hit)
      }
      return hit
    },
  }
}

function percentile(hist: Uint32Array, n: number, p: number) {
  const target = n * p
  let acc = 0
  for (let i = 0; i < 256; i++) {
    acc += hist[i]
    if (acc >= target) return i
  }
  return 255
}

/** Nearest-pixel read with edge clamping. */
export function sampleAt(field: Float32Array, w: number, h: number, x: number, y: number) {
  const xi = x < 0 ? 0 : x >= w ? w - 1 : x | 0
  const yi = y < 0 ? 0 : y >= h ? h - 1 : y | 0
  return field[yi * w + xi]
}

export interface Grid {
  cols: number
  rows: number
  v: Float32Array
}

/** Average brightness over a grid of cw × ch cells (cells may be fractional). */
export function gridAverage(src: Source, cw: number, ch = cw): Grid {
  const cols = Math.max(1, Math.ceil(src.w / cw))
  const rows = Math.max(1, Math.ceil(src.h / ch))
  const sum = new Float32Array(cols * rows)
  const cnt = new Uint32Array(cols * rows)
  const { w, h, luma } = src
  for (let y = 0; y < h; y++) {
    const row = Math.min(rows - 1, Math.floor(y / ch)) * cols
    for (let x = 0; x < w; x++) {
      const k = row + Math.min(cols - 1, Math.floor(x / cw))
      sum[k] += luma[y * w + x]
      cnt[k]++
    }
  }
  for (let k = 0; k < sum.length; k++) sum[k] = cnt[k] ? sum[k] / cnt[k] : 1
  return { cols, rows, v: sum }
}

/** Average RGB (0..255) over a grid of square cells. */
export function gridAverageRGB(src: Source, cell: number) {
  const cols = Math.max(1, Math.ceil(src.w / cell))
  const rows = Math.max(1, Math.ceil(src.h / cell))
  const sum = new Float32Array(cols * rows * 3)
  const cnt = new Uint32Array(cols * rows)
  const { w, h, rgba } = src
  for (let y = 0; y < h; y++) {
    const row = Math.min(rows - 1, Math.floor(y / cell)) * cols
    for (let x = 0; x < w; x++) {
      const k = row + Math.min(cols - 1, Math.floor(x / cell))
      const j = (y * w + x) * 4
      sum[k * 3] += rgba[j]
      sum[k * 3 + 1] += rgba[j + 1]
      sum[k * 3 + 2] += rgba[j + 2]
      cnt[k]++
    }
  }
  for (let k = 0; k < cnt.length; k++) {
    const c = cnt[k] || 1
    sum[k * 3] /= c
    sum[k * 3 + 1] /= c
    sum[k * 3 + 2] /= c
  }
  return { cols, rows, rgb: sum }
}

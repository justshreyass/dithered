// Shared dithering + drawing primitives used by the effects.

export type RGB = [number, number, number]

export function hex(c: string): RGB {
  const n = parseInt(c.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** Normalised Bayer threshold matrix (values in 0..1, exclusive). */
export function bayer(size: 2 | 4 | 8 | 16): Float32Array {
  let m = [0]
  let n = 1
  while (n < size) {
    const next = new Array(n * 2 * n * 2)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const v = m[y * n + x] * 4
        next[y * 2 * n + x] = v
        next[y * 2 * n + x + n] = v + 2
        next[(y + n) * 2 * n + x] = v + 3
        next[(y + n) * 2 * n + x + n] = v + 1
      }
    m = next
    n *= 2
  }
  const out = new Float32Array(n * n)
  for (let i = 0; i < out.length; i++) out[i] = (m[i] + 0.5) / (n * n)
  return out
}

export const BAYER4 = bayer(4)
export const BAYER8 = bayer(8)

/** Kernel entries are [dx, dy, weight]. */
export type Kernel = { taps: [number, number, number][]; div: number }

export const FLOYD_STEINBERG: Kernel = {
  taps: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]],
  div: 16,
}
export const ATKINSON: Kernel = {
  taps: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]],
  div: 8,
}

/** Serpentine error diffusion. Returns 1 where the output is light. */
export function errorDiffuse(values: Float32Array, cols: number, rows: number, kernel: Kernel): Uint8Array {
  const buf = Float32Array.from(values)
  const out = new Uint8Array(cols * rows)
  for (let y = 0; y < rows; y++) {
    const ltr = y % 2 === 0
    for (let i = 0; i < cols; i++) {
      const x = ltr ? i : cols - 1 - i
      const k = y * cols + x
      const old = buf[k]
      const on = old >= 0.5 ? 1 : 0
      out[k] = on
      const err = old - on
      for (const [dx, dy, wgt] of kernel.taps) {
        const nx = x + (ltr ? dx : -dx)
        const ny = y + dy
        if (nx < 0 || nx >= cols || ny >= rows) continue
        buf[ny * cols + nx] += (err * wgt) / kernel.div
      }
    }
  }
  return out
}

/** Paint one colour per grid cell, scaled up with hard edges. */
export function paintCells(
  ctx: CanvasRenderingContext2D,
  cols: number,
  rows: number,
  cell: number,
  colorOf: (k: number, x: number, y: number) => RGB,
) {
  const tmp = document.createElement('canvas')
  tmp.width = cols
  tmp.height = rows
  const tctx = tmp.getContext('2d')!
  const img = tctx.createImageData(cols, rows)
  const d = img.data
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const k = y * cols + x
      const c = colorOf(k, x, y)
      d[k * 4] = c[0]
      d[k * 4 + 1] = c[1]
      d[k * 4 + 2] = c[2]
      d[k * 4 + 3] = 255
    }
  tctx.putImageData(img, 0, 0)
  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(tmp, 0, 0, cols * cell, rows * cell)
  ctx.restore()
}

/** Per-pixel coverage field: 0 = paper, 1 = ink. */
export function paintField(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ink: RGB,
  paper: RGB,
  coverage: (x: number, y: number) => number,
) {
  const img = ctx.createImageData(w, h)
  const d = img.data
  for (let y = 0, j = 0; y < h; y++)
    for (let x = 0; x < w; x++, j += 4) {
      let t = coverage(x, y)
      t = t < 0 ? 0 : t > 1 ? 1 : t
      d[j] = paper[0] + (ink[0] - paper[0]) * t
      d[j + 1] = paper[1] + (ink[1] - paper[1]) * t
      d[j + 2] = paper[2] + (ink[2] - paper[2]) * t
      d[j + 3] = 255
    }
  ctx.putImageData(img, 0, 0)
}

/** Antialiased stripe coverage: distance (px) from stripe centre vs half-width (px). */
export function stripe(u: number, period: number, halfWidth: number) {
  const f = u / period - Math.floor(u / period)
  const dist = Math.abs(f - 0.5) * period
  const c = halfWidth - dist + 0.5
  return c < 0 ? 0 : c > 1 ? 1 : c
}

/**
 * Amplitude-modulated halftone dots on a rotated lattice.
 * `amount(b)` maps brightness to ink coverage (0..1); dot area tracks coverage.
 */
export function halftone(
  ctx: CanvasRenderingContext2D,
  field: Float32Array,
  w: number,
  h: number,
  cell: number,
  angleDeg: number,
  amount: (b: number) => number,
  offset: { x: number; y: number } = { x: 0, y: 0 },
) {
  const a = (angleDeg * Math.PI) / 180
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  const cx = w / 2
  const cy = h / 2
  const n = Math.ceil(Math.hypot(w, h) / cell / 2) + 2
  const maxR = cell * 0.75
  ctx.beginPath()
  for (let j = -n; j <= n; j++)
    for (let i = -n; i <= n; i++) {
      const lx = i * cell
      const ly = j * cell
      const x = cx + lx * ca - ly * sa
      const y = cy + lx * sa + ly * ca
      if (x < -cell || y < -cell || x > w + cell || y > h + cell) continue
      const xi = Math.min(w - 1, Math.max(0, x | 0))
      const yi = Math.min(h - 1, Math.max(0, y | 0))
      const cov = amount(field[yi * w + xi])
      if (cov <= 0.002) continue
      const r = Math.min(maxR, cell * Math.sqrt(cov / Math.PI))
      if (r < 0.35) continue
      const px = x + offset.x
      const py = y + offset.y
      ctx.moveTo(px + r, py)
      ctx.arc(px, py, r, 0, Math.PI * 2)
    }
  ctx.fill()
}

/** Cheap bloom: downsample → smooth upscale → additive composite. */
export function bloom(ctx: CanvasRenderingContext2D, w: number, h: number, strength = 0.6) {
  const src = document.createElement('canvas')
  src.width = w
  src.height = h
  src.getContext('2d')!.drawImage(ctx.canvas, 0, 0)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  for (const [div, alpha] of [[6, strength], [18, strength * 0.7]] as const) {
    const small = document.createElement('canvas')
    small.width = Math.max(1, Math.round(w / div))
    small.height = Math.max(1, Math.round(h / div))
    const sctx = small.getContext('2d')!
    sctx.imageSmoothingQuality = 'high'
    sctx.drawImage(src, 0, 0, small.width, small.height)
    ctx.globalAlpha = alpha
    ctx.drawImage(small, 0, 0, w, h)
  }
  ctx.restore()
}

/** Monochrome film/paper grain added in place. */
export function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  for (let y = 0, j = 0; y < h; y++)
    for (let x = 0; x < w; x++, j += 4) {
      const n = (hash(x, y) - 0.5) * amount
      d[j] += n
      d[j + 1] += n
      d[j + 2] += n
    }
  ctx.putImageData(img, 0, 0)
}

/** Deterministic 0..1 hash. */
export function hash(x: number, y: number) {
  let n = (x * 374761393 + y * 668265263) | 0
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  n ^= n >>> 16
  return (n >>> 0) / 4294967296
}

/** Interleaved gradient noise — an even, blue-noise-like threshold. */
export function ign(x: number, y: number) {
  const v = 52.9829189 * ((0.06711056 * x + 0.00583715 * y) % 1)
  return v - Math.floor(v)
}

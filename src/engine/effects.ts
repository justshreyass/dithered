import { clamp01, gridAverage, gridAverageRGB, sampleAt, smoothstep, type Source } from './source'
import {
  ATKINSON,
  BAYER4,
  BAYER8,
  FLOYD_STEINBERG,
  bloom,
  errorDiffuse,
  grain,
  halftone,
  hash,
  hex,
  ign,
  mix,
  paintCells,
  paintField,
  stripe,
  type RGB,
} from './dither'

export interface Effect {
  id: string
  name: string
  /** Short technical line shown on the print. */
  tag: string
  /** Paper + ink, used to tint UI chrome around the result. */
  swatch: [string, string]
  render(ctx: CanvasRenderingContext2D, src: Source): void
}

/** Integer pixel size scaled to the source. */
const ipx = (src: Source, v: number, min = 1) => Math.max(min, Math.round(v * src.s))
/** Fractional pixel size scaled to the source. */
const fpx = (src: Source, v: number, min = 1) => Math.max(min, v * src.s)

function fill(ctx: CanvasRenderingContext2D, color: string, w: number, h: number) {
  ctx.fillStyle = color
  ctx.fillRect(0, 0, w, h)
}

export const EFFECTS: Effect[] = [
  {
    id: 'classic',
    name: 'Classic',
    tag: 'Floyd–Steinberg · 1-bit',
    swatch: ['#f2f0eb', '#0b0b0b'],
    render(ctx, src) {
      const cell = ipx(src, 4)
      const g = gridAverage(src, cell)
      for (let k = 0; k < g.v.length; k++) g.v[k] = clamp01((g.v[k] - 0.5) * 1.1 + 0.52)
      const bits = errorDiffuse(g.v, g.cols, g.rows, FLOYD_STEINBERG)
      const ink = hex('#0b0b0b')
      const paper = hex('#f2f0eb')
      paintCells(ctx, g.cols, g.rows, cell, (k) => (bits[k] ? paper : ink))
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    tag: 'Atkinson · inverted',
    swatch: ['#0a0a0a', '#f4f4ef'],
    render(ctx, src) {
      const cell = ipx(src, 5)
      const g = gridAverage(src, cell)
      const bits = errorDiffuse(g.v, g.cols, g.rows, ATKINSON)
      const ink = hex('#f4f4ef')
      const paper = hex('#0a0a0a')
      paintCells(ctx, g.cols, g.rows, cell, (k) => (bits[k] ? ink : paper))
    },
  },
  {
    id: 'acid',
    name: 'Acid Bayer',
    tag: 'Ordered 8×8 matrix',
    swatch: ['#d4ff3a', '#0d0d0d'],
    render(ctx, src) {
      const cell = ipx(src, 6)
      const g = gridAverage(src, cell)
      const ink = hex('#0d0d0d')
      const paper = hex('#d4ff3a')
      paintCells(ctx, g.cols, g.rows, cell, (k, x, y) =>
        g.v[k] > BAYER8[(y & 7) * 8 + (x & 7)] ? paper : ink,
      )
    },
  },
  {
    id: 'newsprint',
    name: 'Newsprint',
    tag: 'AM halftone · 45°',
    swatch: ['#ebe7e1', '#e3372c'],
    render(ctx, src) {
      const { w, h } = src
      const cell = fpx(src, 14, 3)
      const B = src.blurred(cell * 0.35)
      fill(ctx, '#ebe7e1', w, h)
      ctx.fillStyle = '#e3372c'
      halftone(ctx, B, w, h, cell, 45, (b) => Math.pow(1 - b, 1.05) * 1.1)
      grain(ctx, w, h, 16)
    },
  },
  {
    id: 'engraving',
    name: 'Engraving',
    tag: 'Modulated line screen',
    swatch: ['#f3eee2', '#141414'],
    render(ctx, src) {
      const { w, h } = src
      const p = fpx(src, 12, 3)
      const B = src.blurred(fpx(src, 2))
      const wob = fpx(src, 46)
      const amp = fpx(src, 2.5, 0)
      paintField(ctx, w, h, hex('#141414'), hex('#f3eee2'), (x, y) => {
        const d = Math.pow(1 - B[y * w + x], 1.15)
        const u = x + Math.sin(y / wob) * amp + Math.sin(y / (wob * 3.7) + x / (wob * 9)) * amp * 1.4
        return stripe(u, p, d * p * 0.5)
      })
    },
  },
  {
    id: 'phasic',
    name: 'Phasic',
    tag: 'Phase-shifted wave lines',
    swatch: ['#0a0806', '#ff6b1a'],
    render(ctx, src) {
      const { w, h } = src
      const p = fpx(src, 14, 3)
      const B = src.blurred(fpx(src, 3))
      paintField(ctx, w, h, hex('#ff6b1a'), hex('#0a0806'), (x, y) => {
        const b = B[y * w + x]
        return stripe(y + b * p * 1.8, p, (0.05 + 0.36 * Math.pow(b, 1.4)) * p)
      })
    },
  },
  {
    id: 'pulse',
    name: 'Pulse',
    tag: 'Signal ridgelines',
    swatch: ['#000000', '#f2f2f2'],
    render(ctx, src) {
      const { w, h } = src
      // Each scanline is a ribbon: brightness lifts it and swells its width.
      const gap = fpx(src, 14, 3)
      const amp = gap * 0.9
      const step = fpx(src, 2.5)
      const B = src.blurred(fpx(src, 3))
      fill(ctx, '#000', w, h)
      ctx.fillStyle = '#f2f2f2'
      let row = 0
      for (let y0 = gap / 2; y0 < h + amp; y0 += gap, row++) {
        const top: number[] = []
        const bot: number[] = []
        for (let x = 0; x <= w + step; x += step) {
          const e = Math.pow(sampleAt(B, w, h, x, y0), 1.3)
          const n = (hash(Math.round(x / step), row) - 0.5) * e * fpx(src, 2.5)
          const yc = y0 + amp * 0.5 - e * amp + n
          const half = gap * (0.04 + 0.4 * e)
          top.push(x, yc - half)
          bot.push(x, yc + half)
        }
        ctx.beginPath()
        ctx.moveTo(top[0], top[1])
        for (let i = 2; i < top.length; i += 2) ctx.lineTo(top[i], top[i + 1])
        for (let i = bot.length - 2; i >= 0; i -= 2) ctx.lineTo(bot[i], bot[i + 1])
        ctx.closePath()
        ctx.fill()
      }
    },
  },
  {
    id: 'terminal',
    name: 'Terminal',
    tag: 'Special-character ramp',
    swatch: ['#0b0b0b', '#ececec'],
    render(ctx, src) {
      const { w, h } = src
      const RAMP = " .`',:;-~^\"=+*<>!?/\\|()[]{}%#&$@"
      const cw = fpx(src, 10, 4)
      const fs = cw / 0.6
      const g = gridAverage(src, cw, fs)
      fill(ctx, '#0b0b0b', w, h)
      ctx.font = `700 ${fs}px "JetBrains Mono", ui-monospace, Menlo, monospace`
      ctx.textBaseline = 'top'
      ctx.fillStyle = '#ececec'
      for (let y = 0; y < g.rows; y++)
        for (let x = 0; x < g.cols; x++) {
          const b = g.v[y * g.cols + x]
          const idx = Math.round(Math.pow(b, 1.1) * (RAMP.length - 1))
          if (idx === 0) continue
          ctx.globalAlpha = 0.4 + 0.6 * b
          ctx.fillText(RAMP[idx], x * cw, y * fs)
        }
      ctx.globalAlpha = 1
    },
  },
  {
    id: 'braille',
    name: 'Braille',
    tag: '2×4 cell diffusion',
    swatch: ['#dcd6c8', '#171717'],
    render(ctx, src) {
      const { w, h } = src
      const ds = fpx(src, 6, 2)
      const gx = ds * 0.5
      const charW = 2 * ds + gx
      const charH = 4 * ds + gx
      const cols = Math.ceil(w / charW)
      const rows = Math.ceil(h / charH)
      const dx = cols * 2
      const dy = rows * 4
      const B = src.blurred(ds * 0.5)
      const px = new Float32Array(dx)
      const py = new Float32Array(dy)
      for (let i = 0; i < dx; i++) px[i] = Math.floor(i / 2) * charW + (i % 2) * ds + (gx + ds) / 2
      for (let j = 0; j < dy; j++) py[j] = Math.floor(j / 4) * charH + (j % 4) * ds + (gx + ds) / 2
      const vals = new Float32Array(dx * dy)
      for (let j = 0; j < dy; j++)
        // dots can only cover ~40% of the page, so push tones darker to compensate
        for (let i = 0; i < dx; i++) vals[j * dx + i] = Math.pow(sampleAt(B, w, h, px[i], py[j]), 1.7)
      const bits = errorDiffuse(vals, dx, dy, FLOYD_STEINBERG)
      fill(ctx, '#dcd6c8', w, h)
      const r = ds * 0.47
      const off = new Path2D()
      const on = new Path2D()
      for (let j = 0; j < dy; j++)
        for (let i = 0; i < dx; i++) {
          const p = bits[j * dx + i] ? off : on
          p.moveTo(px[i] + r, py[j])
          p.arc(px[i], py[j], r, 0, Math.PI * 2)
        }
      ctx.fillStyle = 'rgba(0,0,0,0.05)'
      ctx.fill(off)
      ctx.fillStyle = '#121212'
      ctx.fill(on)
    },
  },
  {
    id: 'commits',
    name: 'Commits',
    tag: 'Contribution grid · 5 levels',
    swatch: ['#0d1117', '#39d353'],
    render(ctx, src) {
      const { w, h } = src
      const pitch = fpx(src, 26, 5)
      const gap = pitch * 0.2
      const rad = pitch * 0.18
      const g = gridAverage(src, pitch)
      const LEVELS = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353']
      const paths = LEVELS.map(() => new Path2D())
      for (let y = 0; y < g.rows; y++)
        for (let x = 0; x < g.cols; x++) {
          const b = smoothstep(0.08, 0.92, g.v[y * g.cols + x])
          const q = Math.min(4, Math.floor(b * 4 + BAYER4[(y & 3) * 4 + (x & 3)]))
          paths[q].roundRect(x * pitch + gap / 2, y * pitch + gap / 2, pitch - gap, pitch - gap, rad)
        }
      fill(ctx, '#0d1117', w, h)
      LEVELS.forEach((c, i) => {
        ctx.fillStyle = c
        ctx.fill(paths[i])
      })
    },
  },
  {
    id: 'holo',
    name: 'Holographic',
    tag: 'Thin-film foil · ordered',
    swatch: ['#08080c', '#b8f0ff'],
    render(ctx, src) {
      const { w, h } = src
      const cell = ipx(src, 5)
      const g = gridAverage(src, cell)
      const dark: RGB = [8, 8, 12]
      const TAU = Math.PI * 2
      paintCells(ctx, g.cols, g.rows, cell, (k, x, y) => {
        const b = g.v[k]
        if (b <= BAYER8[(y & 7) * 8 + (x & 7)]) return dark
        const t = b * 0.85 + (x / g.cols + y / g.rows) * 0.6 + 0.08 * Math.sin((y / g.rows) * Math.PI * 6)
        const lum = 0.55 + 0.45 * b
        return [
          (0.62 + 0.38 * Math.cos(TAU * t)) * 255 * lum,
          (0.62 + 0.38 * Math.cos(TAU * (t + 0.33))) * 255 * lum,
          (0.62 + 0.38 * Math.cos(TAU * (t + 0.67))) * 255 * lum,
        ]
      })
      // scan rows
      ctx.fillStyle = 'rgba(0,0,0,0.28)'
      for (let y = 0; y < g.rows; y++) ctx.fillRect(0, y * cell + cell * 0.7, w, Math.max(1, cell * 0.3))
      // foil sheen
      const sheen = ctx.createLinearGradient(0, 0, w, h)
      sheen.addColorStop(0, 'rgba(255,255,255,0)')
      sheen.addColorStop(0.45, 'rgba(255,255,255,0.16)')
      sheen.addColorStop(0.55, 'rgba(255,255,255,0)')
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      ctx.fillStyle = sheen
      ctx.fillRect(0, 0, w, h)
      ctx.restore()
      bloom(ctx, w, h, 0.32)
    },
  },
  {
    id: 'ember',
    name: 'Ember',
    tag: 'LED matrix · bloom',
    swatch: ['#090403', '#ff9a2e'],
    render(ctx, src) {
      const { w, h } = src
      const cell = fpx(src, 12, 4)
      const g = gridAverage(src, cell)
      const lo = hex('#8a2203')
      const hi = hex('#ffbe5c')
      const BUCKETS = 8
      const paths = Array.from({ length: BUCKETS }, () => new Path2D())
      for (let y = 0; y < g.rows; y++)
        for (let x = 0; x < g.cols; x++) {
          const b = Math.pow(g.v[y * g.cols + x], 1.6)
          const r = cell * 0.42 * b
          if (r < cell * 0.06) continue
          const cx = (x + 0.5) * cell
          const cy = (y + 0.5) * cell
          const p = paths[Math.min(BUCKETS - 1, Math.floor(b * BUCKETS))]
          p.moveTo(cx + r, cy)
          p.arc(cx, cy, r, 0, Math.PI * 2)
        }
      fill(ctx, '#090403', w, h)
      paths.forEach((p, i) => {
        const c = mix(lo, hi, (i + 0.5) / BUCKETS)
        ctx.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`
        ctx.fill(p)
      })
      bloom(ctx, w, h, 0.5)
    },
  },
  {
    id: 'pop',
    name: 'Pixel Pop',
    tag: '8-ink palette mosaic',
    swatch: ['#efe8d8', '#e8432e'],
    render(ctx, src) {
      const { w, h } = src
      const cell = ipx(src, 22, 4)
      const { cols, rows, rgb } = gridAverageRGB(src, cell)
      const PAL = ['#141414', '#f4efe2', '#e8432e', '#2457d6', '#f7c530', '#f06aa6', '#1f9e5a', '#8a5cf0']
      const pal = PAL.map(hex)
      const paths = PAL.map(() => new Path2D())
      const inset = Math.max(1, cell * 0.08)
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const k = y * cols + x
          let r = rgb[k * 3]
          let g = rgb[k * 3 + 1]
          let b = rgb[k * 3 + 2]
          const l = (r + g + b) / 3
          r = l + (r - l) * 1.8
          g = l + (g - l) * 1.8
          b = l + (b - l) * 1.8
          const t = (BAYER4[(y & 3) * 4 + (x & 3)] - 0.5) * 110
          let best = 0
          let bestD = Infinity
          for (let i = 0; i < pal.length; i++) {
            const dr = r + t - pal[i][0]
            const dg = g + t - pal[i][1]
            const db = b + t - pal[i][2]
            const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11
            if (d < bestD) {
              bestD = d
              best = i
            }
          }
          paths[best].rect(x * cell + inset / 2, y * cell + inset / 2, cell - inset, cell - inset)
        }
      fill(ctx, '#efe8d8', w, h)
      PAL.forEach((c, i) => {
        ctx.fillStyle = c
        ctx.fill(paths[i])
      })
      grain(ctx, w, h, 12)
    },
  },
  {
    id: 'cursors',
    name: 'Cursors',
    tag: 'Vector field glyphs',
    swatch: ['#4a0b33', '#ffe14a'],
    render(ctx, src) {
      const { w, h } = src
      const cell = fpx(src, 28, 8)
      const B = src.blurred(cell * 0.5)
      const hstep = cell * 0.5
      fill(ctx, '#4a0b33', w, h)
      // Classic pointer, tip at origin, drawn in a 0..12 × 0..20 box.
      const arrow = new Path2D('M0 0 L0 17 L4.2 13 L7 19.5 L9.6 18.4 L6.9 12.2 L12.4 12.2 Z')
      const tipDir = Math.atan2(-14, -5.5)
      ctx.lineJoin = 'round'
      ctx.fillStyle = '#6b48ff'
      ctx.strokeStyle = '#ffe14a'
      const rows = Math.ceil(h / cell) + 1
      const cols = Math.ceil(w / cell) + 1
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const cx = (i + 0.5) * cell + (hash(i, j) - 0.5) * cell * 0.3
          const cy = (j + 0.5) * cell + (hash(j + 101, i) - 0.5) * cell * 0.3
          // bright areas get big pointers, shadows fall back to the dark ground
          const light = sampleAt(B, w, h, cx, cy)
          if (light < 0.1) continue
          const gx = sampleAt(B, w, h, cx + hstep, cy) - sampleAt(B, w, h, cx - hstep, cy)
          const gy = sampleAt(B, w, h, cx, cy + hstep) - sampleAt(B, w, h, cx, cy - hstep)
          const flow = Math.hypot(gx, gy) > 0.015 ? Math.atan2(gy, gx) + Math.PI / 2 : -2.2
          const angle = flow + (hash(i * 7, j * 13) - 0.5) * 0.4
          const size = cell * 1.45 * Math.pow(light, 1.3)
          if (size < cell * 0.2) continue
          const k = size / 20
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          ctx.translate(cx, cy)
          ctx.rotate(angle - tipDir)
          ctx.scale(k, k)
          ctx.translate(-5, -10)
          ctx.lineWidth = fpx(src, 1.8) / k
          ctx.fill(arrow)
          ctx.stroke(arrow)
        }
      ctx.setTransform(1, 0, 0, 1, 0, 0)
    },
  },
  {
    id: 'blueprint',
    name: 'Blueprint',
    tag: '4-layer crosshatch',
    swatch: ['#11355c', '#e9f2ff'],
    render(ctx, src) {
      const { w, h } = src
      const p = fpx(src, 9, 3)
      const B = src.blurred(fpx(src, 1.5))
      const maxHW = p * 0.22
      const R = Math.SQRT1_2
      paintField(ctx, w, h, hex('#e9f2ff'), hex('#11355c'), (x, y) => {
        const b = B[y * w + x]
        let c = stripe((x + y) * R, p, clamp01((b - 0.1) / 0.22) * maxHW)
        if (b > 0.32) c = Math.max(c, stripe((x - y) * R, p, clamp01((b - 0.32) / 0.22) * maxHW))
        if (b > 0.55) c = Math.max(c, stripe(x, p, clamp01((b - 0.55) / 0.22) * maxHW))
        if (b > 0.75) c = Math.max(c, stripe(y, p, clamp01((b - 0.75) / 0.2) * maxHW))
        return c
      })
      const step = fpx(src, 120, 20)
      ctx.strokeStyle = 'rgba(233,242,255,0.12)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = step; x < w; x += step) {
        ctx.moveTo(Math.round(x) + 0.5, 0)
        ctx.lineTo(Math.round(x) + 0.5, h)
      }
      for (let y = step; y < h; y += step) {
        ctx.moveTo(0, Math.round(y) + 0.5)
        ctx.lineTo(w, Math.round(y) + 0.5)
      }
      ctx.stroke()
    },
  },
  {
    id: 'stipple',
    name: 'Stipple',
    tag: 'Jittered blue-noise dots',
    swatch: ['#e9eee3', '#0f5a3b'],
    render(ctx, src) {
      const { w, h } = src
      const cell = fpx(src, 5, 2)
      const B = src.blurred(cell * 0.5)
      const cols = Math.ceil(w / cell)
      const rows = Math.ceil(h / cell)
      fill(ctx, '#e9eee3', w, h)
      const path = new Path2D()
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const cx = (i + 0.5 + (hash(i, j) - 0.5) * 0.7) * cell
          const cy = (j + 0.5 + (hash(j + 999, i) - 0.5) * 0.7) * cell
          const d = Math.pow(1 - sampleAt(B, w, h, cx, cy), 1.15)
          if (ign(i, j) >= d) continue
          const r = cell * 0.42 * (0.8 + 0.5 * d)
          path.moveTo(cx + r, cy)
          path.arc(cx, cy, r, 0, Math.PI * 2)
        }
      ctx.fillStyle = '#0f5a3b'
      ctx.fill(path)
      grain(ctx, w, h, 10)
    },
  },
  {
    id: 'riso',
    name: 'Riso',
    tag: '2-ink misregistered halftone',
    swatch: ['#f4efe5', '#ff48b0'],
    render(ctx, src) {
      const { w, h } = src
      const cell = fpx(src, 11, 3)
      const B = src.blurred(cell * 0.3)
      fill(ctx, '#f4efe5', w, h)
      ctx.save()
      ctx.globalCompositeOperation = 'multiply'
      ctx.fillStyle = '#ff48b0'
      halftone(ctx, B, w, h, cell, 75, (b) => smoothstep(0, 0.85, 1 - b) * 0.92, {
        x: fpx(src, 3, 0),
        y: -fpx(src, 2, 0),
      })
      ctx.fillStyle = '#2b5ce6'
      halftone(ctx, B, w, h, cell, 15, (b) => smoothstep(0.32, 1, 1 - b))
      ctx.restore()
      grain(ctx, w, h, 18)
    },
  },
  {
    id: 'pocket',
    name: 'Pocket LCD',
    tag: '4-shade handheld screen',
    swatch: ['#9bbc0f', '#0f380f'],
    render(ctx, src) {
      const { w, h } = src
      const cell = ipx(src, 7, 2)
      const g = gridAverage(src, cell)
      const PAL = ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'].map(hex)
      paintCells(ctx, g.cols, g.rows, cell, (k, x, y) => {
        const q = Math.min(3, Math.floor(g.v[k] * 3 + BAYER4[(y & 3) * 4 + (x & 3)]))
        return PAL[q]
      })
      const line = Math.max(1, Math.round(cell * 0.14))
      ctx.fillStyle = 'rgba(15,56,15,0.12)'
      for (let x = 0; x < g.cols; x++) ctx.fillRect(x * cell, 0, line, h)
      for (let y = 0; y < g.rows; y++) ctx.fillRect(0, y * cell, w, line)
    },
  },
  {
    id: 'dotmatrix',
    name: 'Dot Matrix',
    tag: 'Bi-level LED panel',
    swatch: ['#2443e6', '#f5f7ff'],
    render(ctx, src) {
      const { w, h } = src
      const cell = fpx(src, 13, 4)
      const g = gridAverage(src, cell)
      const r = cell * 0.4
      const on = new Path2D()
      const off = new Path2D()
      for (let y = 0; y < g.rows; y++)
        for (let x = 0; x < g.cols; x++) {
          const lit = Math.pow(g.v[y * g.cols + x], 1.35) > BAYER4[(y & 3) * 4 + (x & 3)]
          const p = lit ? on : off
          const cx = (x + 0.5) * cell
          const cy = (y + 0.5) * cell
          p.moveTo(cx + r, cy)
          p.arc(cx, cy, r, 0, Math.PI * 2)
        }
      fill(ctx, '#1d36c9', w, h)
      ctx.fillStyle = 'rgba(255,255,255,0.07)'
      ctx.fill(off)
      ctx.fillStyle = '#f5f7ff'
      ctx.fill(on)
      bloom(ctx, w, h, 0.12)
    },
  },
  {
    id: 'spiral',
    name: 'Spiral',
    tag: 'Single-line Archimedean',
    swatch: ['#efe9de', '#141414'],
    render(ctx, src) {
      const { w, h } = src
      const p = fpx(src, 10, 3)
      const B = src.blurred(fpx(src, 1.5))
      const cx = w / 2
      const cy = h * 0.45
      const turn = p / (Math.PI * 2)
      paintField(ctx, w, h, hex('#141414'), hex('#efe9de'), (x, y) => {
        const dx = x - cx
        const dy = y - cy
        const u = Math.hypot(dx, dy) - Math.atan2(dy, dx) * turn
        return stripe(u, p, Math.pow(1 - B[y * w + x], 1.1) * p * 0.5)
      })
    },
  },
]

export function effectIndex(id: string) {
  return EFFECTS.findIndex((e) => e.id === id)
}

/** Uniform random pick, never repeating the previous effect. */
export function pickEffect(previous?: string): Effect {
  const forced = new URLSearchParams(location.search).get('fx')
  const hit = forced ? EFFECTS.find((e) => e.id === forced) : undefined
  if (hit) return hit
  const pool = EFFECTS.filter((e) => e.id !== previous)
  const r = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32
  return pool[Math.floor(r * pool.length)]
}

export function renderEffect(src: Source, effect: Effect): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = src.w
  canvas.height = src.h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  effect.render(ctx, src)
  return canvas
}

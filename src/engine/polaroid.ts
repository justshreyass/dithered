import type { Effect } from './effects'

export interface PrintMeta {
  effect: Effect
  index: number
  total: number
  date: Date
}

/**
 * Frame geometry in output pixels, shared by the on-screen print and the
 * exported PNG so they match exactly. `u` is one design unit (1px at a 1200px
 * short side).
 */
export function polaroidLayout(iw: number, ih: number) {
  const u = Math.min(iw, ih) / 1200
  const pad = Math.round(72 * u)
  const bottom = Math.round(300 * u)
  return { u, pad, bottom, fw: iw + pad * 2, fh: ih + pad + bottom }
}

export const pad2 = (n: number) => String(n).padStart(2, '0')

export function formatDate(d: Date) {
  return `${pad2(d.getDate())} · ${pad2(d.getMonth() + 1)} · ${d.getFullYear()}`
}

export function serial(meta: Pick<PrintMeta, 'index' | 'total'>) {
  return `№ ${pad2(meta.index + 1)} / ${meta.total}`
}

export async function composePolaroid(image: HTMLCanvasElement, meta: PrintMeta): Promise<Blob> {
  const iw = image.width
  const ih = image.height
  const { u, pad, fw, fh } = polaroidLayout(iw, ih)
  const canvas = document.createElement('canvas')
  canvas.width = fw
  canvas.height = fh
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!

  ctx.fillStyle = '#fbfaf7'
  ctx.fillRect(0, 0, fw, fh)

  ctx.drawImage(image, pad, pad)
  // a hairline where the emulsion meets the frame
  ctx.strokeStyle = 'rgba(0,0,0,0.14)'
  ctx.lineWidth = Math.max(1, u * 1.5)
  ctx.strokeRect(pad, pad, iw, ih)

  const top = pad + ih
  const right = fw - pad
  const ls = (px: number) => {
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`
  }

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#0b0b0b'
  ctx.font = `600 ${64 * u}px "Inter Tight", "Helvetica Neue", Helvetica, Arial, sans-serif`
  ls(-1.6 * u)
  ctx.textAlign = 'left'
  ctx.fillText(meta.effect.name, pad, top + 122 * u)

  ctx.font = `500 ${21 * u}px "JetBrains Mono", ui-monospace, Menlo, monospace`
  ls(2 * u)
  ctx.fillStyle = '#85847e'
  ctx.fillText(meta.effect.tag.toUpperCase(), pad, top + 168 * u)

  ctx.textAlign = 'right'
  ctx.fillStyle = '#0b0b0b'
  ctx.fillText(serial(meta), right, top + 82 * u)
  ctx.fillStyle = '#85847e'
  ctx.fillText(formatDate(meta.date), right, top + 120 * u)

  // maker's mark
  ctx.fillStyle = '#0b0b0b'
  ctx.font = `700 ${18 * u}px "JetBrains Mono", ui-monospace, Menlo, monospace`
  ls(3 * u)
  ctx.fillText('DITHERED', right, top + 246 * u)
  const m = 5 * u
  const mx = right - ctx.measureText('DITHERED').width - 18 * u - m * 3
  const my = top + 246 * u - m * 3
  for (const [x, y] of [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]]) ctx.fillRect(mx + x * m, my + y * m, m, m)

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode PNG'))), 'image/png'),
  )
}

export async function downloadPolaroid(image: HTMLCanvasElement, meta: PrintMeta) {
  const blob = await composePolaroid(image, meta)
  const d = meta.date
  const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `dithered-${meta.effect.id}-${stamp}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

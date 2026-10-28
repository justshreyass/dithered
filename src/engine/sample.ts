// A procedural still life (lit spheres on a floor) used to preview every
// effect before the visitor has taken a photo.

function sphere(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const g = ctx.createRadialGradient(cx - r * 0.38, cy - r * 0.42, r * 0.04, cx, cy, r * 1.15)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.22, '#e6e6e6')
  g.addColorStop(0.62, '#6a6a6a')
  g.addColorStop(1, '#141414')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
}

function shadow(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, a: number) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(1, ry / rx)
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx)
  g.addColorStop(0, `rgba(0,0,0,${a})`)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, rx, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export function sampleScene(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const horizon = h * 0.64

  const wall = ctx.createLinearGradient(0, 0, 0, horizon)
  wall.addColorStop(0, '#f0f0f0')
  wall.addColorStop(1, '#8c8c8c')
  ctx.fillStyle = wall
  ctx.fillRect(0, 0, w, horizon)

  const floor = ctx.createLinearGradient(0, horizon, 0, h)
  floor.addColorStop(0, '#5e5e5e')
  floor.addColorStop(1, '#c4c4c4')
  ctx.fillStyle = floor
  ctx.fillRect(0, horizon, w, h - horizon)

  shadow(ctx, w * 0.6, h * 0.73, w * 0.36, w * 0.07, 0.75)
  shadow(ctx, w * 0.22, h * 0.83, w * 0.13, w * 0.03, 0.7)
  sphere(ctx, w * 0.52, h * 0.5, w * 0.3)
  sphere(ctx, w * 0.2, h * 0.78, w * 0.1)
  return c
}

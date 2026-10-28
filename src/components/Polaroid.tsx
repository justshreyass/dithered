import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import { EFFECTS } from '../engine/effects'
import { BAYER8 } from '../engine/dither'
import { formatDate, pad2, polaroidLayout, serial } from '../engine/polaroid'
import { tick } from '../lib/sound'
import { Scramble } from './Scramble'
import { Mark } from './Icons'
import type { Print } from '../App'

export type Stage = 'roll' | 'reveal' | 'done'

interface Props {
  print: Print
  stage: Stage
  onRolled(): void
  onRevealed(): void
}

const ROLL_MS = 1500
const REVEAL_MS = 1700

export function Polaroid({ print, stage, onRolled, onRevealed }: Props) {
  const reduce = useReducedMotion()
  const { canvas, effect, index, date } = print
  const iw = canvas.width
  const ih = canvas.height
  const L = polaroidLayout(iw, ih)
  const photo = useRef<HTMLCanvasElement>(null)
  const mask = useRef<HTMLCanvasElement>(null)
  const [rollIdx, setRollIdx] = useState(() => (index + 7) % EFFECTS.length)
  const [landed, setLanded] = useState(false)
  const tilt = useMemo(() => (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 1.4), [])

  // copy the render into the on-screen canvas
  useEffect(() => {
    const c = photo.current
    if (!c) return
    c.width = iw
    c.height = ih
    c.getContext('2d')!.drawImage(canvas, 0, 0)
  }, [canvas, iw, ih])

  // mask grid: low-res, scaled up with hard edges
  const cols = iw > ih ? 64 : 48
  const rows = Math.round((cols * ih) / iw)

  const drawMask = (p: number) => {
    const c = mask.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, cols, rows)
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const v = BAYER8[(y & 7) * 8 + (x & 7)] * 0.55 + (y / rows) * 0.45
        if (v < p) continue
        // a thin bright band rides just ahead of the reveal, like a print head
        ctx.fillStyle = p > 0 && v < p + 0.035 ? '#e9e8e3' : '#0e0e0d'
        ctx.fillRect(x, y, 1, 1)
      }
  }

  useEffect(() => {
    const c = mask.current
    if (!c) return
    c.width = cols
    c.height = rows
    drawMask(stage === 'done' ? 1.1 : 0)
  }, [cols, rows])

  // slot-machine roll through the deck, landing on the drawn effect
  useEffect(() => {
    if (stage !== 'roll') return
    if (reduce) {
      setRollIdx(index)
      setLanded(true)
      const t = setTimeout(onRolled, 300)
      return () => clearTimeout(t)
    }
    let elapsed = 0
    let delay = 40
    let i = rollIdx
    let timer = 0
    const step = () => {
      elapsed += delay
      if (elapsed >= ROLL_MS) {
        setRollIdx(index)
        setLanded(true)
        tick()
        timer = window.setTimeout(onRolled, 520)
        return
      }
      i = (i + 1) % EFFECTS.length
      setRollIdx(i)
      if (delay > 70) tick()
      delay *= 1.13
      timer = window.setTimeout(step, delay)
    }
    timer = window.setTimeout(step, delay)
    return () => clearTimeout(timer)
  }, [stage])

  // dither-dissolve develop
  useEffect(() => {
    if (stage !== 'reveal') return
    const dur = reduce ? 300 : REVEAL_MS
    const t0 = performance.now()
    let raf = 0
    const loop = (now: number) => {
      const t = Math.min(1, (now - t0) / dur)
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      drawMask(e * 1.08)
      if (t < 1) raf = requestAnimationFrame(loop)
      else onRevealed()
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [stage])

  // pointer tilt + glare
  const mx = useMotionValue(0.5)
  const my = useMotionValue(0.5)
  const rx = useSpring(useTransform(my, [0, 1], [7, -7]), { stiffness: 150, damping: 18 })
  const ry = useSpring(useTransform(mx, [0, 1], [-9, 9]), { stiffness: 150, damping: 18 })
  const gx = useTransform(mx, [0, 1], ['0%', '100%'])
  const gy = useTransform(my, [0, 1], ['0%', '100%'])
  const glare = useMotionTemplate`radial-gradient(circle at ${gx} ${gy}, rgba(255,255,255,0.35), rgba(255,255,255,0) 55%)`
  const [hover, setHover] = useState(false)

  const style = {
    '--pr': `${L.fw} / ${L.fh}`,
    '--prn': L.fw / L.fh,
    '--u': `calc(100cqw / ${L.fw / L.u})`,
  } as CSSProperties
  const pct = (v: number, of: number) => `${(v / of) * 100}%`
  const rolling = EFFECTS[rollIdx]

  return (
    <motion.div
      className="pol-wrap"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -120, rotate: tilt * 4, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, rotate: tilt, scale: 1 }}
      transition={{ type: 'spring', stiffness: 90, damping: 16, mass: 1.1 }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse') return
        const r = e.currentTarget.getBoundingClientRect()
        mx.set((e.clientX - r.left) / r.width)
        my.set((e.clientY - r.top) / r.height)
      }}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
      onPointerLeave={() => {
        setHover(false)
        mx.set(0.5)
        my.set(0.5)
      }}
    >
      <motion.div className={`pol ${iw > ih ? 'landscape' : 'portrait'}`} style={{ ...style, rotateX: rx, rotateY: ry }}>
        <div
          className="pol-photo"
          style={{ left: pct(L.pad, L.fw), top: pct(L.pad, L.fh), width: pct(iw, L.fw), height: pct(ih, L.fh) }}
        >
          <canvas ref={photo} className="pol-img" aria-label={`Your photo, printed with the ${effect.name} effect`} role="img" />
          <canvas ref={mask} className="pol-mask" aria-hidden />
          {stage === 'roll' && (
            <motion.div className="roll" exit={{ opacity: 0 }}>
              <p className="roll-label">{landed ? 'Effect drawn' : 'Drawing effect'}</p>
              <motion.p
                key={landed ? 'landed' : rollIdx}
                className={`roll-name ${landed ? 'landed' : ''}`}
                initial={{ y: landed ? 0 : 14, opacity: 0.2, scale: landed ? 1.25 : 1 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                transition={landed ? { type: 'spring', stiffness: 400, damping: 18 } : { duration: 0.08 }}
              >
                {rolling.name}
              </motion.p>
              <p className="roll-count">
                {pad2(rollIdx + 1)} / {EFFECTS.length}
              </p>
            </motion.div>
          )}
          {stage === 'reveal' && <p className="developing">Developing</p>}
        </div>

        <div className="pol-cap" style={{ top: pct(L.pad + ih, L.fh), left: pct(L.pad, L.fw), right: pct(L.pad, L.fw) }}>
          <span className="cap-name">
            {stage === 'roll' ? <span className="cap-pending">————</span> : <Scramble text={effect.name} duration={700} />}
          </span>
          <span className="cap-tag">{stage === 'roll' ? '' : effect.tag}</span>
          <span className="cap-serial">{serial({ index, total: EFFECTS.length })}</span>
          <span className="cap-date">{formatDate(date)}</span>
          <span className="cap-mark">
            <Mark />
            DITHERED
          </span>
        </div>

        <motion.div className="pol-glare" style={{ background: glare }} animate={{ opacity: hover ? 1 : 0 }} />
      </motion.div>
    </motion.div>
  )
}

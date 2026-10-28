import { useEffect, useRef, useState, type MouseEvent, type RefObject } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { CamStatus } from '../lib/useCamera'
import { orientationOf, type Orientation } from '../lib/capture'
import { BAYER4 } from '../engine/dither'
import { EFFECTS } from '../engine/effects'
import { IconFlip, IconPower, IconTimer, IconUpload, IconClose } from './Icons'

interface Props {
  status: CamStatus
  stream: MediaStream | null
  mirrored: boolean
  videoRef: RefObject<HTMLVideoElement | null>
  countdown: number | null
  flashKey: number
  timer: boolean
  canFlip: boolean
  onPowerOn(): void
  onPowerOff(): void
  onShutter(): void
  onUpload(): void
  onTimer(): void
  onFlip(): void
}

const isNarrow = () => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 720px)').matches

// Mouse clicks on camera controls shouldn't steal focus, so Space keeps firing the shutter.
const keepFocus = (e: MouseEvent) => e.preventDefault()

export function Device(p: Props) {
  const [ar, setAr] = useState<Orientation>(() => (isNarrow() ? 'portrait' : 'landscape'))
  const [res, setRes] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const live = p.status === 'live'
  const needle = useRef<HTMLSpanElement>(null)
  const ev = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const v = p.videoRef.current
    if (!v) return
    v.srcObject = p.stream
    setReady(false)
    if (!p.stream) {
      setRes(null)
      return
    }
    const onMeta = () => {
      setAr(orientationOf(v.videoWidth, v.videoHeight))
      setRes(`${v.videoWidth}×${v.videoHeight}`)
      setReady(true)
    }
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('resize', onMeta)
    v.play().catch(() => {})
    return () => {
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('resize', onMeta)
    }
  }, [p.stream, p.videoRef])

  return (
    <div className={`device ${ar}`} data-status={p.status}>
      <div className="device-top">
        <span className="dt-cell">
          <i className={`led ${live ? 'on' : ''}`} /> CAM-01
        </span>
        <span className="dt-cell dt-mid">{live ? <Timecode /> : p.status === 'starting' ? 'WAKING' : 'STBY'}</span>
        <span className="dt-cell dt-right">
          {ar === 'portrait' ? '3:4' : '4:3'} · {res ?? '————'}
        </span>
      </div>

      <div className="screen">
        <video ref={p.videoRef} playsInline muted autoPlay className={`feed ${p.mirrored ? 'mirror' : ''} ${ready ? 'ready' : ''}`} />
        {live ? (
          <Hud
            videoRef={p.videoRef}
            mirrored={p.mirrored}
            ar={ar}
            locking={p.countdown !== null}
            needle={needle}
            ev={ev}
            onPowerOff={p.onPowerOff}
          />
        ) : (
          <Standby status={p.status} ar={ar} onPowerOn={p.onPowerOn} onUpload={p.onUpload} />
        )}
        <div className="grain" aria-hidden />
        <AnimatePresence>
          {p.countdown !== null && (
            <motion.div
              key={p.countdown}
              className="countdown"
              initial={{ opacity: 0, scale: 1.6, filter: 'blur(8px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            >
              {p.countdown}
            </motion.div>
          )}
        </AnimatePresence>
        {p.flashKey > 0 && (
          <div key={p.flashKey} className="shot" aria-hidden>
            <i className="blade top" />
            <i className="blade bottom" />
            <i className="flash" />
          </div>
        )}
      </div>

      <div className="device-chin">
        <div className="chin-side">
          <button className="chip" onMouseDown={keepFocus} onClick={p.onUpload} aria-label="Upload a photo">
            <IconUpload />
            <span>Upload</span>
          </button>
          <button
            className={`chip ${p.timer ? 'active' : ''}`}
            onMouseDown={keepFocus}
            onClick={p.onTimer}
            aria-pressed={p.timer}
            aria-label="3 second timer"
          >
            <IconTimer />
            <span>3s</span>
          </button>
        </div>

        <button
          className={`shutter ${live ? 'armed' : ''}`}
          onMouseDown={keepFocus}
          onClick={live ? p.onShutter : p.onPowerOn}
          disabled={p.status === 'starting' || p.countdown !== null}
          aria-label={live ? 'Take photo' : 'Turn on camera'}
        >
          <span className="shutter-ring" />
          <span className="shutter-core">{!live && <IconPower />}</span>
        </button>

        <div className="chin-side right">
          {p.canFlip && live && (
            <button className="chip" onMouseDown={keepFocus} onClick={p.onFlip} aria-label="Switch camera">
              <IconFlip />
            </button>
          )}
          <div className="meter" aria-hidden>
            <div className="meter-scale">
              {Array.from({ length: 13 }, (_, i) => (
                <i key={i} className={i % 6 === 0 ? 'major' : ''} />
              ))}
              <span ref={needle} className="meter-needle" />
            </div>
            <div className="meter-label">
              <span>EV</span>
              <span ref={ev}>{live ? '0.0' : '—'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Timecode() {
  const el = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const t0 = performance.now()
    let raf = 0
    const loop = (now: number) => {
      const t = (now - t0) / 1000
      const f = Math.floor((t % 1) * 24)
      const s = Math.floor(t) % 60
      const m = Math.floor(t / 60) % 60
      if (el.current) el.current.textContent = `REC ${pad(m)}:${pad(s)}:${pad(f)}`
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <span ref={el}>REC 00:00:00</span>
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Overlay on the live feed: framing marks, reticle, 1-bit monitor and the meter loop. */
function Hud({
  videoRef,
  mirrored,
  ar,
  locking,
  needle,
  ev,
  onPowerOff,
}: {
  videoRef: RefObject<HTMLVideoElement | null>
  mirrored: boolean
  ar: Orientation
  locking: boolean
  needle: RefObject<HTMLSpanElement | null>
  ev: RefObject<HTMLSpanElement | null>
  onPowerOff(): void
}) {
  const mon = useRef<HTMLCanvasElement>(null)
  const fx = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const c = mon.current
    if (!c) return
    const W = ar === 'portrait' ? 48 : 64
    const H = ar === 'portrait' ? 64 : 48
    c.width = W
    c.height = H
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    let last = 0
    let raf = 0
    let roll = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (now - last < 66) return
      last = now
      const v = videoRef.current
      if (!v || !v.videoWidth) return
      const vw = v.videoWidth
      const vh = v.videoHeight
      const aspect = W / H
      let cw = vw
      let ch = vh
      if (vw / vh > aspect) cw = vh * aspect
      else ch = vw / aspect
      ctx.drawImage(v, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, W, H)
      const img = ctx.getImageData(0, 0, W, H)
      const d = img.data
      let sum = 0
      for (let i = 0; i < W * H; i++) sum += (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255
      const mean = sum / (W * H)
      // normalise around the mean so the preview stays readable in any light
      const gain = 0.5 / Math.max(0.08, mean)
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const j = (y * W + x) * 4
          const l = ((0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2]) / 255) * gain
          const on = l > BAYER4[(y & 3) * 4 + (x & 3)] ? 245 : 8
          d[j] = d[j + 1] = d[j + 2] = on
        }
      ctx.putImageData(img, 0, 0)
      const pos = Math.min(1, Math.max(0, (mean - 0.1) / 0.7))
      if (needle.current) needle.current.style.left = `${pos * 100}%`
      if (ev.current) ev.current.textContent = `${mean >= 0.45 ? '+' : ''}${((mean - 0.45) * 4).toFixed(1)}`
      if (fx.current && ++roll % 2 === 0) {
        const e = EFFECTS[(Math.random() * EFFECTS.length) | 0]
        fx.current.textContent = e.name.toUpperCase()
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [ar, videoRef, needle, ev])

  return (
    <motion.div className={`hud ${locking ? 'locking' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      <div className="thirds" aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="sweep" aria-hidden />
      {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
        <i key={c} className={`corner ${c}`} aria-hidden />
      ))}
      <div className="reticle" aria-hidden>
        <i />
        <i />
        <i />
        <i />
        <b />
      </div>
      <div className="hud-tl">
        <span className="blink">●</span> LIVE
      </div>
      <button className="hud-off" onClick={onPowerOff} aria-label="Turn off camera">
        <IconClose />
      </button>
      <figure className="monitor">
        <canvas ref={mon} className={mirrored ? 'mirror' : ''} />
        <figcaption>1-BIT</figcaption>
      </figure>
      <div className="hud-bl">
        AF·C <span>ISO AUTO</span>
      </div>
      <div className="hud-br">
        FX ▸ <span ref={fx}>??????</span>
      </div>
    </motion.div>
  )
}

/** Animated ordered-dither "no signal" field shown while the camera is off. */
function Standby({
  status,
  ar,
  onPowerOn,
  onUpload,
}: {
  status: CamStatus
  ar: Orientation
  onPowerOn(): void
  onUpload(): void
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const W = ar === 'portrait' ? 72 : 96
    const H = ar === 'portrait' ? 96 : 72
    c.width = W
    c.height = H
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(W, H)
    const d = img.data
    let raf = 0
    let last = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (now - last < 50) return
      last = now
      const t = now / 1000
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const nx = x / W - 0.5
          const ny = y / H - 0.5
          const r = Math.hypot(nx, ny * (H / W))
          let v = 0.5 + 0.5 * Math.sin(r * 26 - t * 2.2)
          v *= 0.55 + 0.45 * Math.sin(nx * 7 + t * 0.7) * Math.cos(ny * 5 - t * 0.5)
          v *= 1 - Math.min(1, r * 1.5)
          const on = v * 0.6 > BAYER4[(y & 3) * 4 + (x & 3)]
          const j = (y * W + x) * 4
          const c = on ? 70 : 10
          d[j] = d[j + 1] = d[j + 2] = c
          d[j + 3] = 255
        }
      ctx.putImageData(img, 0, 0)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [ar])

  const copy: Record<string, { title: string; sub: string }> = {
    off: { title: 'Camera standby', sub: 'Your camera stays off until you switch it on.' },
    starting: { title: 'Waking sensor…', sub: 'Allow camera access if your browser asks.' },
    denied: { title: 'Camera blocked', sub: "Allow camera access in your browser's site settings, or upload a photo instead." },
    unavailable: { title: 'No camera found', sub: 'Upload a photo instead — it works the same.' },
    error: { title: 'Camera hiccup', sub: 'Something interrupted the camera. Try again.' },
  }
  const c = copy[status] ?? copy.off

  return (
    <div className="standby">
      <canvas ref={ref} className="standby-field" aria-hidden />
      <div className="standby-copy">
        <p className="standby-title">{c.title}</p>
        <p className="standby-sub">{c.sub}</p>
        {status !== 'starting' && (
          <div className="standby-actions">
            {status !== 'unavailable' && (
              <button className="btn btn-light" onClick={onPowerOn}>
                <IconPower />
                {status === 'off' ? 'Power on camera' : 'Try again'}
              </button>
            )}
            {status !== 'off' && (
              <button className="btn btn-ghost-light" onClick={onUpload}>
                <IconUpload />
                Upload photo
              </button>
            )}
          </div>
        )}
        {status === 'starting' && <div className="loader" aria-hidden />}
      </div>
    </div>
  )
}

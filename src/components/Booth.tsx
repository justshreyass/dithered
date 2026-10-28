import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useCamera } from '../lib/useCamera'
import { captureVideo } from '../lib/capture'
import { shutterSound, tick } from '../lib/sound'
import { Device } from './Device'
import { Deck } from './Deck'
import { IconCamera, IconUpload } from './Icons'

interface Props {
  autoStart: boolean
  busy: boolean
  onCapture(crop: HTMLCanvasElement): void
  onFile(file: File): void
}

const rise = {
  hidden: { opacity: 0, y: 18, filter: 'blur(6px)' },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { delay: 0.08 + i * 0.07, type: 'spring' as const, stiffness: 220, damping: 26 },
  }),
}

export function Booth({ autoStart, busy, onCapture, onFile }: Props) {
  const cam = useCamera()
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const deviceRef = useRef<HTMLDivElement>(null)
  const countRef = useRef<number | null>(null)
  const [timer, setTimer] = useState(false)
  const [count, setCount] = useState<number | null>(null)
  const [flashKey, setFlashKey] = useState(0)
  const [dragging, setDragging] = useState(false)
  const live = cam.status === 'live'

  const { start } = cam
  useEffect(() => {
    if (autoStart) void start()
  }, [autoStart, start])

  useEffect(() => () => {
    if (countRef.current) clearInterval(countRef.current)
  }, [])

  const powerOn = useCallback(() => {
    void start()
    if (matchMedia('(max-width: 720px)').matches) deviceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [start])

  const fire = useCallback(() => {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    shutterSound()
    setFlashKey((k) => k + 1)
    onCapture(captureVideo(v, cam.facing === 'user'))
  }, [cam.facing, onCapture])

  const shoot = useCallback(() => {
    if (!live || busy || countRef.current) return
    if (!timer) return fire()
    let n = 3
    setCount(n)
    tick()
    countRef.current = window.setInterval(() => {
      n--
      if (n > 0) {
        setCount(n)
        tick()
        return
      }
      clearInterval(countRef.current!)
      countRef.current = null
      setCount(null)
      fire()
    }, 1000)
  }, [live, busy, timer, fire])

  const pickFile = useCallback(() => fileRef.current?.click(), [])

  // keyboard: space / enter shoots, escape powers off
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // a keyboard-focused control keeps its native Space/Enter behaviour
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, button, a')) return
      if (live && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault()
        shoot()
      } else if (live && e.code === 'Escape') cam.stop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [live, shoot, cam])

  // drag & drop anywhere on the page
  useEffect(() => {
    let depth = 0
    const has = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const enter = (e: DragEvent) => {
      if (!has(e)) return
      depth++
      setDragging(true)
    }
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (!depth) setDragging(false)
    }
    const over = (e: DragEvent) => has(e) && e.preventDefault()
    const drop = (e: DragEvent) => {
      if (!has(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      const f = e.dataTransfer?.files[0]
      if (f) onFile(f)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', over)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', over)
      window.removeEventListener('drop', drop)
    }
  }, [onFile])

  return (
    <motion.div
      className={`booth ${live ? 'is-live' : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.985, filter: 'blur(6px)', transition: { duration: 0.35 } }}
    >
      <section className="hero">
        <div className="hero-copy">
          <motion.h1 variants={rise} initial="hidden" animate="show" custom={0}>
            Get dithered.
          </motion.h1>
          <motion.div className="cta-row" variants={rise} initial="hidden" animate="show" custom={1}>
            {live ? (
              <button className="btn btn-dark" onClick={shoot} disabled={count !== null}>
                <IconCamera />
                Take photo
                <kbd>Space</kbd>
              </button>
            ) : (
              <button className="btn btn-dark" onClick={powerOn} disabled={cam.status === 'starting'}>
                <IconCamera />
                Open camera
              </button>
            )}
            <button className="btn btn-outline" onClick={pickFile}>
              <IconUpload />
              Upload photo
            </button>
          </motion.div>
        </div>

        <motion.div
          ref={deviceRef}
          className="hero-device"
          initial={{ opacity: 0, y: 40, rotateX: 12 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ type: 'spring', stiffness: 120, damping: 20, delay: 0.2 }}
        >
          <Device
            status={cam.status}
            stream={cam.stream}
            mirrored={cam.facing === 'user'}
            videoRef={videoRef}
            countdown={count}
            flashKey={flashKey}
            timer={timer}
            canFlip={cam.canFlip}
            onPowerOn={powerOn}
            onPowerOff={cam.stop}
            onShutter={shoot}
            onUpload={pickFile}
            onTimer={() => setTimer((t) => !t)}
            onFlip={cam.flip}
          />
        </motion.div>
      </section>

      <Deck />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) onFile(f)
        }}
      />

      {dragging && (
        <motion.div className="dropzone" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="dropzone-inner">
            <IconUpload />
            <p>Drop to print</p>
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}

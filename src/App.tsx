import { useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Booth } from './components/Booth'
import { Darkroom } from './components/Darkroom'
import { Mark } from './components/Icons'
import { EFFECTS, effectIndex, pickEffect, renderEffect, type Effect } from './engine/effects'
import { buildSource } from './engine/source'
import { ensureFonts } from './engine/fonts'
import { loadImageFile, orientationOf, outputSize } from './lib/capture'

export interface Print {
  canvas: HTMLCanvasElement
  effect: Effect
  index: number
  ms: number
  date: Date
  origin: 'camera' | 'upload'
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)))

export default function App() {
  const [print, setPrint] = useState<Print | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameFromCamera, setCameFromCamera] = useState(false)
  const last = useRef<string | undefined>(undefined)

  const develop = useCallback(async (crop: HTMLCanvasElement, origin: Print['origin']) => {
    setBusy(true)
    setError(null)
    try {
      await ensureFonts()
      // let the shutter flash start before the heavy synchronous render
      await nextFrame()
      await new Promise((r) => setTimeout(r, origin === 'camera' ? 120 : 0))
      const size = outputSize(orientationOf(crop.width, crop.height))
      const t0 = performance.now()
      const src = buildSource(crop, size.w, size.h)
      const effect = pickEffect(last.current)
      const canvas = renderEffect(src, effect)
      const ms = performance.now() - t0
      last.current = effect.id
      setCameFromCamera(origin === 'camera')
      setPrint({ canvas, effect, index: effectIndex(effect.id), ms, date: new Date(), origin })
      window.scrollTo({ top: 0 })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong developing that photo.')
    } finally {
      setBusy(false)
    }
  }, [])

  const onCapture = useCallback((crop: HTMLCanvasElement) => void develop(crop, 'camera'), [develop])

  const onFile = useCallback(
    async (file: File) => {
      setBusy(true)
      setError(null)
      try {
        const crop = await loadImageFile(file)
        await develop(crop, 'upload')
      } catch (e) {
        setBusy(false)
        setError(e instanceof Error ? e.message : 'Could not read that image.')
      }
    },
    [develop],
  )

  const retake = useCallback(() => setPrint(null), [])

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={retake} aria-label="Dithered — home">
          <Mark size={15} />
          <span>Dithered</span>
        </button>
        <p className="topbar-meta">
          <span>{EFFECTS.length} effects</span>
          <span>No login</span>
          <span>Nothing saved</span>
        </p>
      </header>

      <main>
        <AnimatePresence mode="wait">
          {print ? (
            <Darkroom key={`print-${print.date.getTime()}`} print={print} onRetake={retake} />
          ) : (
            <Booth key="booth" autoStart={cameFromCamera} busy={busy} onCapture={onCapture} onFile={onFile} />
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {busy && !print && (
          <motion.div
            className="toast"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
          >
            <span className="loader dark" /> Developing your print…
          </motion.div>
        )}
        {error && (
          <motion.div
            className="toast error"
            role="alert"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            onClick={() => setError(null)}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

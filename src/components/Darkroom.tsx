import { useCallback, useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { EFFECTS } from '../engine/effects'
import { downloadPolaroid, pad2 } from '../engine/polaroid'
import { Polaroid, type Stage } from './Polaroid'
import { IconDownload, IconRetake } from './Icons'
import type { Print } from '../App'

interface Props {
  print: Print
  onRetake(): void
}

const item = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, type: 'spring' as const, stiffness: 260, damping: 26 } }),
}

export function Darkroom({ print, onRetake }: Props) {
  const [stage, setStage] = useState<Stage>('roll')
  const [saving, setSaving] = useState(false)
  const done = stage === 'done'
  const { effect, index, canvas, ms } = print

  const download = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      await downloadPolaroid(canvas, { effect, index, total: EFFECTS.length, date: print.date })
    } finally {
      setSaving(false)
    }
  }, [saving, canvas, effect, index, print.date])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'r' || e.key === 'R') onRetake()
      if (done && (e.key === 'd' || e.key === 'D')) void download()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [done, download, onRetake])

  const portrait = canvas.height > canvas.width
  const stats: [string, string][] = [
    ['Effect', `${pad2(index + 1)} of ${EFFECTS.length}`],
    ['Format', `${portrait ? '3:4' : '4:3'} · ${canvas.width}×${canvas.height}`],
    ['Render', `${Math.max(1, Math.round(ms))} ms, on this device`],
    ['Stored', 'Nowhere'],
  ]

  return (
    <motion.section
      className={`darkroom ${portrait ? 'portrait' : 'landscape'}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25 } }}
    >
      <div className="dr-stage">
        <Polaroid print={print} stage={stage} onRolled={() => setStage('reveal')} onRevealed={() => setStage('done')} />
      </div>

      <motion.aside className="dr-panel" initial="hidden" animate={done ? 'show' : 'hidden'} aria-live="polite">
        <motion.p className="eyebrow" variants={item} custom={0}>
          <span className="eyebrow-dot" /> You drew · 1 in {EFFECTS.length}
        </motion.p>
        <motion.h2 variants={item} custom={1}>
          {effect.name}
        </motion.h2>
        <motion.p className="dr-tag" variants={item} custom={2}>
          {effect.tag}
          <span className="swatches" aria-hidden>
            <i style={{ background: effect.swatch[0] }} />
            <i style={{ background: effect.swatch[1] }} />
          </span>
        </motion.p>
        <motion.dl className="stats" variants={item} custom={3}>
          {stats.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </motion.dl>
        <motion.div className="cta-row" variants={item} custom={4}>
          <button className="btn btn-dark" onClick={download} disabled={!done || saving}>
            <IconDownload />
            {saving ? 'Saving…' : 'Download print'}
            <kbd>D</kbd>
          </button>
          <button className="btn btn-outline" onClick={onRetake}>
            <IconRetake />
            Retake
            <kbd>R</kbd>
          </button>
        </motion.div>
        <motion.p className="fine" variants={item} custom={5}>
          Made in your browser. Nothing was uploaded, and it's gone when you leave or retake.
        </motion.p>
      </motion.aside>
    </motion.section>
  )
}

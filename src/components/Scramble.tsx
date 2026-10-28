import { useEffect, useState } from 'react'
import { useReducedMotion } from 'motion/react'

const GLYPHS = '█▓▒░#%&@$*+=/\\<>'

/** Text that decodes from noise glyphs, left to right, whenever it changes. */
export function Scramble({ text, duration = 650, className }: { text: string; duration?: number; className?: string }) {
  const reduce = useReducedMotion()
  const [out, setOut] = useState(text)

  useEffect(() => {
    if (reduce) {
      setOut(text)
      return
    }
    let raf = 0
    const start = performance.now()
    const loop = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const n = Math.floor(p * text.length)
      let s = text.slice(0, n)
      for (let i = n; i < text.length; i++) s += text[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0]
      setOut(s)
      if (p < 1) raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [text, duration, reduce])

  return <span className={className}>{out}</span>
}

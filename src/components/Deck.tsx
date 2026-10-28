import { useEffect, useState } from 'react'
import { EFFECTS, renderEffect } from '../engine/effects'
import { buildSource } from '../engine/source'
import { sampleScene } from '../engine/sample'
import { ensureFonts } from '../engine/fonts'
import { pad2 } from '../engine/polaroid'

const TW = 240
const TH = 320

// Rendered once per page load and shared across remounts.
let cache: Record<string, string> | null = null

/** A marquee previewing every effect on a procedural still life. */
export function Deck() {
  const [thumbs, setThumbs] = useState<Record<string, string>>(cache ?? {})

  useEffect(() => {
    if (cache) return
    let cancelled = false
    const acc: Record<string, string> = {}
    ;(async () => {
      await ensureFonts()
      const src = buildSource(sampleScene(TW, TH), TW, TH, 0.36)
      for (const e of EFFECTS) {
        if (cancelled) return
        // yield between renders so the page stays responsive
        await new Promise((r) => setTimeout(r, 16))
        acc[e.id] = renderEffect(src, e).toDataURL('image/png')
        setThumbs({ ...acc })
      }
      cache = acc
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const cards = EFFECTS.map((e, i) => (
    <figure className="card" key={e.id}>
      <div className="card-img" style={{ background: e.swatch[0] }}>
        {thumbs[e.id] ? <img src={thumbs[e.id]} alt="" /> : <span className="card-loading" />}
      </div>
      <figcaption>
        <span className="card-n">{pad2(i + 1)}</span>
        <span className="card-name">{e.name}</span>
      </figcaption>
    </figure>
  ))

  return (
    <section className="deck" aria-label="All effects">
      <header className="deck-head">
        <h2>
          The deck <span>/ {EFFECTS.length} effects</span>
        </h2>
        <p>Every print draws one at random. You won't know which until it develops.</p>
      </header>
      <div className="marquee">
        <div className="marquee-track">
          <div className="marquee-set">{cards}</div>
          <div className="marquee-set" aria-hidden>
            {cards}
          </div>
        </div>
      </div>
    </section>
  )
}

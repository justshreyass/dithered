// Tiny synthesized UI sounds — no audio files to load.

let ac: AudioContext | null = null

function audio() {
  if (!ac) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ac = new Ctor()
  }
  if (ac.state === 'suspended') void ac.resume()
  return ac
}

function noiseBurst(at: number, dur: number, freq: number, gain: number) {
  const a = audio()
  if (!a) return
  const len = Math.ceil(a.sampleRate * dur)
  const buf = a.createBuffer(1, len, a.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3)
  const src = a.createBufferSource()
  src.buffer = buf
  const bp = a.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = freq
  bp.Q.value = 0.9
  const g = a.createGain()
  g.gain.value = gain
  src.connect(bp).connect(g).connect(a.destination)
  src.start(a.currentTime + at)
}

export function shutterSound() {
  noiseBurst(0, 0.05, 3200, 0.5)
  noiseBurst(0.07, 0.07, 1800, 0.35)
}

export function tick() {
  const a = audio()
  if (!a) return
  const o = a.createOscillator()
  const g = a.createGain()
  o.frequency.value = 1760
  g.gain.setValueAtTime(0.06, a.currentTime)
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.06)
  o.connect(g).connect(a.destination)
  o.start()
  o.stop(a.currentTime + 0.07)
}

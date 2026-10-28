import { useCallback, useEffect, useRef, useState } from 'react'

export type CamStatus = 'off' | 'starting' | 'live' | 'denied' | 'unavailable' | 'error'
export type Facing = 'user' | 'environment'

export function useCamera() {
  const [status, setStatus] = useState<CamStatus>('off')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [facing, setFacing] = useState<Facing>('user')
  const [canFlip, setCanFlip] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)
  // Bumped on every start/stop so a slow getUserMedia can't resurrect a stopped camera.
  const gen = useRef(0)

  const release = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  const stop = useCallback(() => {
    gen.current++
    release()
    setStream(null)
    setStatus('off')
  }, [])

  const start = useCallback(async (face: Facing = 'user') => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable')
      return
    }
    const mine = ++gen.current
    release()
    setStatus('starting')
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: face, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      if (mine !== gen.current) {
        s.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = s
      setStream(s)
      setFacing(face)
      setStatus('live')
      const devices = await navigator.mediaDevices.enumerateDevices()
      setCanFlip(devices.filter((d) => d.kind === 'videoinput').length > 1)
    } catch (e) {
      if (mine !== gen.current) return
      const name = (e as DOMException).name
      setStatus(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'denied'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'unavailable'
            : 'error',
      )
    }
  }, [])

  useEffect(
    () => () => {
      gen.current++
      release()
    },
    [],
  )

  const flip = useCallback(() => start(facing === 'user' ? 'environment' : 'user'), [facing, start])

  return { status, stream, facing, canFlip, start, stop, flip }
}

// Turning a camera frame or an uploaded file into a 3:4 / 4:3 crop.

const MAX_LONG_SIDE = 2400

export type Orientation = 'portrait' | 'landscape'

export const orientationOf = (w: number, h: number): Orientation => (w > h ? 'landscape' : 'portrait')

/** Final print resolution: 1200 × 1600 or 1600 × 1200. */
export function outputSize(o: Orientation) {
  return o === 'portrait' ? { w: 1200, h: 1600 } : { w: 1600, h: 1200 }
}

/** Centre-crop to the print aspect — the same crop `object-fit: cover` shows in the viewfinder. */
export function cropToPrint(src: CanvasImageSource, sw: number, sh: number, mirror = false): HTMLCanvasElement {
  const aspect = orientationOf(sw, sh) === 'landscape' ? 4 / 3 : 3 / 4
  let cw = sw
  let ch = sh
  if (sw / sh > aspect) cw = sh * aspect
  else ch = sw / aspect
  const k = Math.min(1, MAX_LONG_SIDE / Math.max(cw, ch))
  const out = document.createElement('canvas')
  out.width = Math.round(cw * k)
  out.height = Math.round(ch * k)
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  if (mirror) {
    ctx.translate(out.width, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, out.width, out.height)
  return out
}

export function captureVideo(video: HTMLVideoElement, mirror: boolean) {
  return cropToPrint(video, video.videoWidth, video.videoHeight, mirror)
}

export async function loadImageFile(file: File): Promise<HTMLCanvasElement> {
  if (!file.type.startsWith('image/') && !/\.(heic|heif|avif|webp|jpe?g|png|gif)$/i.test(file.name)) {
    throw new Error('That file is not an image.')
  }
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const out = cropToPrint(bmp, bmp.width, bmp.height)
    bmp.close()
    return out
  } catch {
    // Fallback for formats createImageBitmap rejects but <img> can decode.
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return cropToPrint(img, img.naturalWidth, img.naturalHeight)
    } catch {
      throw new Error("This browser can't read that image. Try a JPG or PNG.")
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

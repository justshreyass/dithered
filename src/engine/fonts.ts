let ready: Promise<void> | null = null

/** Canvas text needs the web fonts loaded first, or it silently falls back. */
export function ensureFonts(): Promise<void> {
  if (!ready) {
    const loads = Promise.all([
      document.fonts.load('600 64px "Inter Tight"'),
      document.fonts.load('500 21px "JetBrains Mono"'),
      document.fonts.load('700 18px "JetBrains Mono"'),
    ]).then(() => undefined)
    const timeout = new Promise<void>((r) => setTimeout(r, 2500))
    ready = Promise.race([loads, timeout]).catch(() => undefined)
  }
  return ready
}

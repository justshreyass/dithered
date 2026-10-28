const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export const IconCamera = () => (
  <svg {...base}>
    <path d="M4 8h3l1.6-2.4h6.8L17 8h3v11H4z" />
    <circle cx="12" cy="13" r="3.6" />
  </svg>
)
export const IconUpload = () => (
  <svg {...base}>
    <path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4" />
  </svg>
)
export const IconDownload = () => (
  <svg {...base}>
    <path d="M12 4v12M7 11l5 5 5-5M4 20h16" />
  </svg>
)
export const IconRetake = () => (
  <svg {...base}>
    <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5" />
  </svg>
)
export const IconFlip = () => (
  <svg {...base}>
    <path d="M4 9a8 8 0 0 1 14-3l2 2M20 4v4h-4M20 15a8 8 0 0 1-14 3l-2-2M4 20v-4h4" />
  </svg>
)
export const IconTimer = () => (
  <svg {...base}>
    <circle cx="12" cy="13.5" r="7" />
    <path d="M12 10v3.5l2.2 1.6M10 3h4" />
  </svg>
)
export const IconPower = () => (
  <svg {...base}>
    <path d="M12 3v8M7 6.3a7 7 0 1 0 10 0" />
  </svg>
)
export const IconClose = () => (
  <svg {...base}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

/** 3×3 checker mark used as the logo. */
export const Mark = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 3 3" aria-hidden shapeRendering="crispEdges">
    <rect x="0" y="0" width="1" height="1" fill="currentColor" />
    <rect x="2" y="0" width="1" height="1" fill="currentColor" />
    <rect x="1" y="1" width="1" height="1" fill="currentColor" />
    <rect x="0" y="2" width="1" height="1" fill="currentColor" />
    <rect x="2" y="2" width="1" height="1" fill="currentColor" />
  </svg>
)

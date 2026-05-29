/** Marcas SVG compartidas (revuelta sorteada, duelo rival). */
export function MatchPitchMarkings() {
  const line = 'rgba(255,255,255,0.42)'
  const lineSoft = 'rgba(255,255,255,0.22)'
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 140"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <pattern id="grass-stripes" width="100" height="10" patternUnits="userSpaceOnUse">
          <rect width="100" height="5" fill="rgba(0,0,0,0.04)" />
          <rect y="5" width="100" height="5" fill="rgba(255,255,255,0.03)" />
        </pattern>
      </defs>
      <rect width="100" height="140" fill="url(#grass-stripes)" />

      <rect
        x="4"
        y="4"
        width="92"
        height="132"
        fill="none"
        stroke={line}
        strokeWidth="0.55"
        rx="1"
      />

      <line x1="4" y1="70" x2="96" y2="70" stroke={line} strokeWidth="0.5" />
      <circle cx="50" cy="70" r="9" fill="none" stroke={line} strokeWidth="0.45" />
      <circle cx="50" cy="70" r="0.8" fill={line} />

      <rect
        x="22"
        y="4"
        width="56"
        height="22"
        fill="none"
        stroke={lineSoft}
        strokeWidth="0.4"
      />
      <rect
        x="34"
        y="4"
        width="32"
        height="8"
        fill="none"
        stroke={lineSoft}
        strokeWidth="0.35"
      />

      <rect
        x="22"
        y="114"
        width="56"
        height="22"
        fill="none"
        stroke={lineSoft}
        strokeWidth="0.4"
      />
      <rect
        x="34"
        y="126"
        width="32"
        height="8"
        fill="none"
        stroke={lineSoft}
        strokeWidth="0.35"
      />

      <path
        d="M 38 26 A 12 12 0 0 0 62 26"
        fill="none"
        stroke={lineSoft}
        strokeWidth="0.35"
      />
      <path
        d="M 38 114 A 12 12 0 0 1 62 114"
        fill="none"
        stroke={lineSoft}
        strokeWidth="0.35"
      />
    </svg>
  )
}

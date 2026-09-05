// Company brand mark for the catering-channel bid-review deployment: a
// vermilion seal disc carrying a gold arowana stroke. Fixed brand colors (not
// currentColor) so the mark reads on both themes; the seal echoes the
// reviewing desk's stamp metaphor.

import type { IconProps } from './icons/props.ts'

/**
 * Render the company brand mark (vermilion seal + gold fish).
 * @param props.size - square edge in px (default 24).
 * @param props.className - extra class for layout placement.
 * @returns the mark svg (aria-hidden; pair with the wordmark for accessibility).
 */
export function BrandMark({ size = 24, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="11" fill="#C8102E" />
      <circle cx="12" cy="12" r="9.4" fill="none" stroke="#D9A441" strokeOpacity="0.45" strokeWidth="0.7" />
      <path
        d="M5.6 12c2.3-3.5 6.6-4.7 9.9-2.7 1 .6 1.9 1.6 2.5 2.7-.6 1.1-1.5 2.1-2.5 2.7-3.3 2-7.6.8-9.9-2.7Z"
        fill="#D9A441"
      />
      <path d="M17.4 12l3.1-2.7c-.5 1.8-.5 3.6 0 5.4L17.4 12Z" fill="#D9A441" />
      <circle cx="8.9" cy="11.1" r="0.95" fill="#C8102E" />
    </svg>
  )
}

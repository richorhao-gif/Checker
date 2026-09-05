// Company brand mark for the catering-channel bid-review deployment: a
// vermilion seal square with an inset gold border and a gold arowana device.
// Fixed brand colors (not currentColor) so the mark reads on both themes; the
// square chop echoes the reviewing desk's stamp metaphor and stays legible at
// the 16px sidebar-rail size, where a disc would collapse to a dot.

import type { IconProps } from './icons/props.ts'

/**
 * Render the company brand mark (vermilion seal square + gold arowana).
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
      <rect x="1" y="1" width="22" height="22" rx="3" fill="#C8102E" />
      <rect x="2.6" y="2.6" width="18.8" height="18.8" rx="2.1" fill="none" stroke="#D9A441" strokeWidth="0.9" />
      <path d="M11.6 8.8C12.3 7.5 13.3 6.9 14.3 7.0C13.7 7.7 13.4 8.4 13.4 9.2Z" fill="#D9A441" />
      <path
        d="M6.0 12.3C6.9 9.8 9.6 8.5 12.3 9.0C14.1 9.4 15.4 10.1 16.2 11.0L18.7 8.9C18.0 10.5 17.7 11.5 17.7 12.3C17.7 13.1 18.0 14.1 18.7 15.7L16.2 13.6C15.4 14.5 14.1 15.2 12.3 15.6C9.6 16.1 6.9 14.8 6.0 12.3Z"
        fill="#D9A441"
      />
      <path
        d="M9.3 10.3C10.0 11.4 10.0 13.2 9.3 14.3"
        fill="none"
        stroke="#C8102E"
        strokeWidth="0.6"
        strokeLinecap="round"
      />
      <circle cx="7.7" cy="11.2" r="0.7" fill="#C8102E" />
    </svg>
  )
}

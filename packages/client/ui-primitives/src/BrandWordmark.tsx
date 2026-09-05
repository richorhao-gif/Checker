// Company brand wordmark for the catering-channel bid-review deployment:
// the seal mark plus the company name and a channel badge plate, laid out as
// HTML (not letterform paths) so the Chinese wordmark stays crisp and
// font-driven. Ink rides currentColor; the badge plate inverts like the
// product badge it replaces.

import { BrandMark } from './BrandMark.tsx'
import type { IconProps } from './icons/props.ts'
import css from './BrandWordmark.module.css'

/**
 * Render the full company brand wordmark (mark + name + channel badge).
 * @param props.size - height in px (default 24); the mark matches it and the text scales off it.
 * @param props.className - extra class for layout placement.
 * @returns the wordmark element (aria-hidden decorative brand art).
 */
export function BrandWordmark({ size = 24, className }: IconProps) {
  return (
    <span
      className={className === undefined ? css.root : `${css.root} ${className}`}
      style={{ fontSize: size * 0.6 }}
      aria-hidden="true"
    >
      <BrandMark size={size} className={css.mark} />
      <span className={css.name}>益海嘉里 · 金龙鱼</span>
      <span className={css.badge}>餐饮渠道</span>
    </span>
  )
}

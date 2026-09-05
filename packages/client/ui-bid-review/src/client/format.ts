/**
 * Presentation-only formatting for the bid-review surfaces: byte counts against
 * the Host-configured limits, the times the reviewing desk shows, and the
 * qualifications save time. Pure functions with no locale dependency, so the
 * dictionaries carry the surrounding copy.
 * @module @deepseek-ai/dsh-client-ui-bid-review/client/format
 */

const encoder = new TextEncoder()

/**
 * Count the UTF-8 bytes of a string, the unit both Host limits are expressed in.
 * @param text - text to measure.
 * @returns the encoded byte length.
 */
export function utf8ByteLength(text: string): number {
  return encoder.encode(text).length
}

/** Render one binary-scaled quantity with a single decimal place. */
function scaled(value: number, divisor: number): string {
  return (Math.round((value / divisor) * 10) / 10).toFixed(1)
}

/**
 * Render a byte count for the counter and the failure copy.
 * @param bytes - non-negative byte count.
 * @returns the count in B, KiB, or MiB, whichever keeps it readable.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${scaled(bytes, 1024)} KiB`
  return `${scaled(bytes, 1024 * 1024)} MiB`
}

/**
 * Render a Unix epoch millisecond timestamp in the browser's local time.
 * @param ms - timestamp to render.
 * @returns the date and time to minute precision, `YYYY-MM-DD HH:mm`.
 */
export function formatTimestamp(ms: number): string {
  const date = new Date(ms)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * Render the wall-clock time of one timestamp, the precision the archive tag
 * shows a submission at.
 * @param ms - timestamp to render.
 * @returns the local time as `HH:mm:ss`.
 */
export function formatTimeOfDay(ms: number): string {
  const date = new Date(ms)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/**
 * Render one duration for the status rail's timer.
 * @param ms - elapsed milliseconds; a negative value renders as zero.
 * @returns `mm:ss`, or `h:mm:ss` once the duration passes an hour.
 */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const pad = (value: number): string => String(value).padStart(2, '0')
  const hours = Math.floor(total / 3600)
  const minutes = pad(Math.floor((total % 3600) / 60))
  const seconds = pad(total % 60)
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`
}

/** Chinese numerals by digit, indexed through charAt so no lookup can miss. */
const DIGITS = '〇一二三四五六七八九'

/** Render a calendar component (1-31) in Chinese numerals. */
function chineseCount(value: number): string {
  if (value < 10) return DIGITS.charAt(value)
  const tens = Math.floor(value / 10)
  const ones = value % 10
  const head = tens === 1 ? '十' : `${DIGITS.charAt(tens)}十`
  return ones === 0 ? head : `${head}${DIGITS.charAt(ones)}`
}

/**
 * Render one timestamp as the Chinese-numeral calendar date the opinion sheet
 * signs with.
 * @param ms - timestamp to render.
 * @returns the local date, for example `二〇二六年九月五日`.
 */
export function chineseDate(ms: number): string {
  const date = new Date(ms)
  const year = String(date.getFullYear())
    .split('')
    .map(character => DIGITS.charAt(Number(character)))
    .join('')
  return `${year}年${chineseCount(date.getMonth() + 1)}月${chineseCount(date.getDate())}日`
}

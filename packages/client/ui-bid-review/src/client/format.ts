/**
 * Presentation-only formatting for the bid-review surface: byte counts against
 * the Host-configured limits and the qualifications save time. Pure functions
 * with no locale dependency, so the dictionaries carry the surrounding copy.
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

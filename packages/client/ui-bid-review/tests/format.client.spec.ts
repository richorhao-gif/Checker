/**
 * Presentation-only formatting for the bid-review surface: the UTF-8 byte count
 * both Host limits are expressed in, the scaled byte rendering used by the
 * counter and the failure copy, and the local-time renderings — the
 * qualifications save time, the desk's submission time and turn duration, and
 * the Chinese-numeral date the opinion sheet signs with.
 */
import { describe, expect, it } from 'vitest'
import {
  chineseDate, formatBytes, formatElapsed, formatTimeOfDay, formatTimestamp, utf8ByteLength,
} from '../src/client/format.ts'

describe('utf8ByteLength', () => {
  it('counts bytes, not code units', () => {
    expect(utf8ByteLength('')).toBe(0)
    expect(utf8ByteLength('abc')).toBe(3)
    // Three bytes per CJK code point: the limit a qualifications record meets.
    expect(utf8ByteLength('蔬菜')).toBe(6)
  })

  it('counts a surrogate pair as its four encoded bytes', () => {
    expect(utf8ByteLength('𠀀')).toBe(4)
  })
})

describe('formatBytes', () => {
  it('renders counts below one KiB in bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('renders counts below one MiB in KiB to one decimal', () => {
    expect(formatBytes(1024)).toBe('1.0 KiB')
    expect(formatBytes(1536)).toBe('1.5 KiB')
    expect(formatBytes(65536)).toBe('64.0 KiB')
    // Just under the next unit, rounded up to a whole KiB.
    expect(formatBytes(1024 * 1024 - 1)).toBe('1024.0 KiB')
  })

  it('renders counts from one MiB up in MiB to one decimal', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MiB')
    expect(formatBytes(100 * 1024 * 1024)).toBe('100.0 MiB')
    expect(formatBytes(1536 * 1024)).toBe('1.5 MiB')
  })
})

describe('formatTimestamp', () => {
  it('renders a local timestamp to minute precision, zero-padded', () => {
    expect(formatTimestamp(new Date(2026, 0, 2, 3, 4).getTime())).toBe('2026-01-02 03:04')
    expect(formatTimestamp(new Date(2026, 8, 4, 9, 5).getTime())).toBe('2026-09-04 09:05')
    expect(formatTimestamp(new Date(2026, 11, 31, 0, 0).getTime())).toBe('2026-12-31 00:00')
  })
})

describe('formatTimeOfDay', () => {
  it('renders the wall-clock second a document was submitted at', () => {
    expect(formatTimeOfDay(new Date(2026, 8, 5, 14, 32, 8).getTime())).toBe('14:32:08')
    expect(formatTimeOfDay(new Date(2026, 8, 5, 0, 0, 0).getTime())).toBe('00:00:00')
  })
})

describe('formatElapsed', () => {
  it('renders a duration under an hour as mm:ss', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(4000)).toBe('00:04')
    expect(formatElapsed(72_000)).toBe('01:12')
    // A partial second is dropped, not rounded up.
    expect(formatElapsed(72_999)).toBe('01:12')
  })

  it('renders a duration from an hour up as h:mm:ss', () => {
    expect(formatElapsed(3_600_000)).toBe('1:00:00')
    expect(formatElapsed(3_723_000)).toBe('1:02:03')
  })

  it('renders a clock that ran backwards as zero', () => {
    expect(formatElapsed(-5000)).toBe('00:00')
  })
})

describe('chineseDate', () => {
  it('renders the local date in Chinese numerals', () => {
    expect(chineseDate(new Date(2026, 8, 5).getTime())).toBe('二〇二六年九月五日')
    expect(chineseDate(new Date(2026, 0, 20).getTime())).toBe('二〇二六年一月二十日')
  })

  it('renders ten, the teens, and a tens-plus-ones component', () => {
    expect(chineseDate(new Date(2026, 9, 10).getTime())).toBe('二〇二六年十月十日')
    expect(chineseDate(new Date(2026, 10, 13).getTime())).toBe('二〇二六年十一月十三日')
    expect(chineseDate(new Date(2026, 11, 31).getTime())).toBe('二〇二六年十二月三十一日')
  })
})

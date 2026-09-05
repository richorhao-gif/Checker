// @vitest-environment jsdom
/**
 * The opinion sheet's file output. The copy path is `ui-primitives`' shared
 * `writeClipboard`, pinned there; these specs cover the download this package
 * owns, which hands the sheet over as one Markdown file and releases the object
 * URL it opened.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadText } from '../src/client/output.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('downloadText', () => {
  it('offers the text as one Markdown file and releases the object URL', () => {
    const createObjectURL = vi.fn(() => 'blob:desk/1')
    const revokeObjectURL = vi.fn()
    globalThis.URL.createObjectURL = createObjectURL
    globalThis.URL.revokeObjectURL = revokeObjectURL
    const clicked: { href: string; download: string }[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function patched(this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download })
    })

    downloadText('标书审核意见书.md', '符合。\n')

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(clicked).toEqual([{ href: 'blob:desk/1', download: '标书审核意见书.md' }])
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:desk/1')
    // The anchor leaves with the click.
    expect(document.querySelectorAll('a[download]')).toHaveLength(0)
    click.mockRestore()
  })

  it('hands the blob over as Markdown text', async () => {
    const blobs: Blob[] = []
    globalThis.URL.createObjectURL = (blob: Blob) => {
      blobs.push(blob)
      return 'blob:desk/2'
    }
    globalThis.URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    downloadText('a.md', '正文')

    expect(blobs[0]?.type).toBe('text/markdown;charset=utf-8')
    expect(await blobs[0]?.text()).toBe('正文')
  })
})

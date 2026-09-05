/**
 * The opinion sheet's file output: saving its Markdown as one download. The
 * sheet's copy path is `ui-primitives`' shared `writeClipboard`, so this module
 * owns only the download offered beside it.
 * @module @deepseek-ai/dsh-client-ui-bid-review/client/output
 */

/**
 * Offer one text file for download through a transient object URL.
 * @param filename - suggested file name for the browser's save dialog.
 * @param text - file content.
 */
export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

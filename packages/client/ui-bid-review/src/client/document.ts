/**
 * The one bid document a conversation holds. The Host stores the bytes under a
 * collision-free name and returns an absolute path; this module keeps only
 * enough browser-side memory to redraw the file card and rebuild the prompt
 * after a reload, and encodes a picked File for the JSON-RPC upload body.
 * @module @deepseek-ai/dsh-client-ui-bid-review/client/document
 */

import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'

/** One uploaded bid document, as the composer holds it for its Session. */
export interface StoredDocument {
  /** Original file name, for display only. */
  readonly filename: string
  /** Byte length of the picked file, for display only. */
  readonly bytes: number
  /** Absolute server path the prompt carries and the Agent reads. */
  readonly path: string
}

const KEY_PREFIX = 'dsh-bid-doc:'

/** Storage key of one Session's remembered document. */
function storageKey(sessionId: SessionId): string {
  return `${KEY_PREFIX}${sessionId}`
}

/** Narrow one parsed storage value to a document this package wrote. */
function asDocument(value: unknown): StoredDocument | null {
  if (typeof value !== 'object' || value === null) return null
  const { filename, bytes, path } = value as { filename?: unknown; bytes?: unknown; path?: unknown }
  return typeof filename === 'string' && typeof bytes === 'number' && typeof path === 'string'
    ? { filename, bytes, path }
    : null
}

/** Read one raw storage value, treating anything unreadable as absent. */
function parseStored(raw: string | null): StoredDocument | null {
  if (raw === null) return null
  try {
    return asDocument(JSON.parse(raw) as unknown)
  } catch {
    // Swallows a malformed JSON body: only this package writes the key, so a
    // value that does not parse is residue of an interrupted write, and the
    // document it described is unrecoverable either way.
    return null
  }
}

/**
 * Read the document this browser remembered for one Session.
 * @param storage - the window's sessionStorage.
 * @param sessionId - current Session, absent while no Workspace is connected.
 * @returns the remembered document, or null when none is stored or readable.
 */
export function readStoredDocument(storage: Storage, sessionId: SessionId | undefined): StoredDocument | null {
  if (sessionId === undefined) return null
  return parseStored(storage.getItem(storageKey(sessionId)))
}

/**
 * Remember one uploaded document for its Session, so a reload before the first
 * submitted prompt restores the file card instead of the picker.
 * @param storage - the window's sessionStorage.
 * @param sessionId - current Session; absent stores nothing.
 * @param document - the uploaded document to remember.
 */
export function rememberDocument(storage: Storage, sessionId: SessionId | undefined, document: StoredDocument): void {
  if (sessionId === undefined) return
  storage.setItem(storageKey(sessionId), JSON.stringify(document))
}

/**
 * Drop one Session's remembered document.
 * @param storage - the window's sessionStorage.
 * @param sessionId - current Session; absent forgets nothing.
 */
export function forgetDocument(storage: Storage, sessionId: SessionId | undefined): void {
  if (sessionId === undefined) return
  storage.removeItem(storageKey(sessionId))
}

/**
 * Take the single document of a pick or drop event. This surface accepts one
 * file per conversation, so anything beyond the first is ignored.
 * @param files - the event's file list, absent when the event carried none.
 * @returns the first file, or undefined when nothing was offered.
 */
export function firstFile(files: ArrayLike<File> | null | undefined): File | undefined {
  return files === null || files === undefined ? undefined : files[0]
}

/**
 * Encode a browser File as base64 for the upload body.
 * @param file - the picked bid document.
 * @returns the complete file content, base64-encoded.
 */
export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  // Chunked because String.fromCharCode spreads its arguments onto the stack.
  const chunk = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk))
  }
  return btoa(binary)
}

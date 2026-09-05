/**
 * The one document a conversation holds: the sessionStorage codec that redraws
 * the file card after a reload, its refusal to invent a document from anything
 * this package did not write, and the base64 encoding of a picked File for the
 * JSON-RPC upload body.
 */
import { describe, expect, it } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import {
  fileToBase64, firstFile, forgetDocument, readStoredDocument, rememberDocument,
} from '../src/client/document.ts'
import type { StoredDocument } from '../src/client/document.ts'

const sid = (key: string): SessionId => key as SessionId
const DOC: StoredDocument = { filename: '标书.pdf', bytes: 3, path: '/srv/bid-documents/1f-标书.pdf' }

/** Map-backed Storage stand-in exposing the exact keys written. */
function fakeStorage(): { storage: Storage; entries: Map<string, string> } {
  const entries = new Map<string, string>()
  const storage = {
    get length(): number { return entries.size },
    clear: () => { entries.clear() },
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => { entries.delete(key) },
    setItem: (key: string, value: string) => { entries.set(key, value) },
  } as unknown as Storage
  return { storage, entries }
}

/** Decode base64 back to bytes without a Node-only API. */
function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

describe('the remembered document', () => {
  it('round-trips under a Session-scoped key', () => {
    const { storage, entries } = fakeStorage()

    rememberDocument(storage, sid('s1'), DOC)

    expect([...entries.keys()]).toEqual(['dsh-bid-doc:s1'])
    expect(readStoredDocument(storage, sid('s1'))).toEqual(DOC)
  })

  it('keeps two Sessions on separate keys', () => {
    const { storage } = fakeStorage()

    rememberDocument(storage, sid('s1'), DOC)
    rememberDocument(storage, sid('s2'), { filename: 'other.pdf', bytes: 5, path: '/srv/2f-other.pdf' })

    expect(readStoredDocument(storage, sid('s1'))?.filename).toBe('标书.pdf')
    expect(readStoredDocument(storage, sid('s2'))?.filename).toBe('other.pdf')
  })

  it('replaces a remembered document rather than accumulating', () => {
    const { storage, entries } = fakeStorage()

    rememberDocument(storage, sid('s1'), DOC)
    rememberDocument(storage, sid('s1'), { filename: 'second.pdf', bytes: 6, path: '/srv/2f-second.pdf' })

    expect(entries.size).toBe(1)
    expect(readStoredDocument(storage, sid('s1'))?.filename).toBe('second.pdf')
  })

  it('drops only the addressed Session', () => {
    const { storage } = fakeStorage()
    rememberDocument(storage, sid('s1'), DOC)
    rememberDocument(storage, sid('s2'), DOC)

    forgetDocument(storage, sid('s1'))

    expect(readStoredDocument(storage, sid('s1'))).toBeNull()
    expect(readStoredDocument(storage, sid('s2'))).toEqual(DOC)
  })

  it('does nothing at all while no Session is current', () => {
    const { storage, entries } = fakeStorage()

    rememberDocument(storage, undefined, DOC)
    forgetDocument(storage, undefined)

    expect(entries.size).toBe(0)
    expect(readStoredDocument(storage, undefined)).toBeNull()
  })
})

describe('readStoredDocument over a value this package did not write', () => {
  it('reads an absent key as no document', () => {
    const { storage } = fakeStorage()

    expect(readStoredDocument(storage, sid('s1'))).toBeNull()
  })

  it.each([
    ['malformed JSON', '{interrupted'],
    ['a JSON null', 'null'],
    ['a JSON string', '"标书.pdf"'],
    ['a JSON array', '[]'],
    ['a missing path', '{"filename":"标书.pdf","bytes":3}'],
    ['a missing filename', '{"bytes":3,"path":"/srv/a.pdf"}'],
    ['a missing size', '{"filename":"a.pdf","path":"/srv/a.pdf"}'],
    ['a non-string filename', '{"filename":7,"bytes":3,"path":"/srv/a.pdf"}'],
    ['a non-numeric size', '{"filename":"a.pdf","bytes":"3","path":"/srv/a.pdf"}'],
    ['a non-string path', '{"filename":"a.pdf","bytes":3,"path":7}'],
  ])('reads %s as no document', (_label, raw) => {
    const { storage, entries } = fakeStorage()
    entries.set('dsh-bid-doc:s1', raw)

    expect(readStoredDocument(storage, sid('s1'))).toBeNull()
  })

  it('keeps only the three fields it renders', () => {
    const { storage, entries } = fakeStorage()
    entries.set('dsh-bid-doc:s1', '{"filename":"a.pdf","bytes":3,"path":"/srv/a.pdf","stale":"field"}')

    expect(readStoredDocument(storage, sid('s1'))).toEqual({ filename: 'a.pdf', bytes: 3, path: '/srv/a.pdf' })
  })
})

describe('fileToBase64', () => {
  it('encodes an empty file as an empty string', async () => {
    expect(await fileToBase64(new File([], 'empty.pdf'))).toBe('')
  })

  it('encodes a small file', async () => {
    expect(await fileToBase64(new File(['bid'], '标书.pdf'))).toBe('Ymlk')
  })

  it('preserves multibyte content byte for byte', async () => {
    const bytes = new TextEncoder().encode('蔬菜、肉禽、蛋、奶')
    const encoded = await fileToBase64(new File([bytes], 'a.pdf'))

    expect(decodeBase64(encoded)).toEqual(bytes)
  })

  it('encodes a file larger than one chunk in order', async () => {
    // The encoder chunks at 0x8000 because String.fromCharCode spreads its
    // arguments onto the stack; two chunks prove the loop advances.
    const bytes = new Uint8Array(0x8000 + 1000)
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 256
    const encoded = await fileToBase64(new File([bytes], 'big.pdf'))

    expect(decodeBase64(encoded)).toEqual(bytes)
  })
})

describe('firstFile', () => {
  it('reports an absent list as nothing offered', () => {
    expect(firstFile(null)).toBeUndefined()
    expect(firstFile(undefined)).toBeUndefined()
  })

  it('reports an offered but empty list as nothing offered', () => {
    expect(firstFile([])).toBeUndefined()
  })

  it('takes the first file and ignores the rest', () => {
    const first = new File(['a'], 'first.pdf')
    const second = new File(['b'], 'second.pdf')

    expect(firstFile([first, second])).toBe(first)
  })
})

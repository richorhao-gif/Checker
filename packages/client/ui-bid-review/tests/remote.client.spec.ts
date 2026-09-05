/**
 * The bidReview Remote calls this surface makes: the generated face wraps every
 * business result in the carrier envelope and the Host returns its own ok/error
 * union inside that, so each operation folds the two into one settled outcome,
 * and the failure copy resolves every Host business code plus the carrier's own.
 * An oversized pick is refused after one limits read, before its bytes are
 * encoded into a base64 string the tab cannot hold.
 */
import { describe, expect, it } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { RemoteFailure, RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  BidReviewLimits, BidReviewSetQualificationsResult, BidReviewUploadResult,
  CompanyQualifications,
} from '@deepseek-ai/dsh-bid-review/types'
import {
  failureText, readLimits, readQualifications, saveQualifications, uploadDocument,
} from '../src/client/remote.ts'
import type { BidReviewRemote, ReviewFailure } from '../src/client/remote.ts'
import { zh } from '../src/client/locales.ts'

const t = makeTranslate(zh, commonZh)
const LIMITS: BidReviewLimits = { maxQualificationsBytes: 64, maxDocumentBytes: 128, companyName: '' }
const QUALIFICATIONS: CompanyQualifications = { text: '蔬菜配送', updatedAt: 7 }

/** The wire the operations resolve against, mutable per case. */
interface Wire {
  limits: RemoteResult<BidReviewLimits>
  qualifications: RemoteResult<CompanyQualifications>
  set: RemoteResult<BidReviewSetQualificationsResult>
  upload: RemoteResult<BidReviewUploadResult>
}

function remote(wire: Wire): BidReviewRemote {
  return {
    getLimits: () => Promise.resolve(wire.limits),
    getQualifications: () => Promise.resolve(wire.qualifications),
    setQualifications: () => Promise.resolve(wire.set),
    uploadDocument: () => Promise.resolve(wire.upload),
  }
}

function happy(): Wire {
  return {
    limits: { ok: true, value: LIMITS },
    qualifications: { ok: true, value: QUALIFICATIONS },
    set: { ok: true, value: { ok: true, value: { text: '蔬菜配送', updatedAt: 9 } } },
    upload: { ok: true, value: { ok: true, value: { path: '/srv/bid-documents/1f-标书.pdf' } } },
  }
}

/** One carrier-level refusal, as the RPC gateway reports it. */
function carrier(code: string, message = 'gateway said no'): RemoteFailure {
  return { code, message, details: {} }
}

describe('the two reads', () => {
  it('settles the limits', async () => {
    expect(await readLimits(remote(happy()))).toEqual({ ok: true, value: LIMITS })
  })

  it('settles the shared qualifications', async () => {
    expect(await readQualifications(remote(happy()))).toEqual({ ok: true, value: QUALIFICATIONS })
  })

  it('reports a carrier failure with its own text', async () => {
    const wire = happy()
    wire.limits = { ok: false, error: carrier('not-found') }
    wire.qualifications = { ok: false, error: carrier('unavailable', 'host gone') }

    expect(await readLimits(remote(wire))).toEqual({
      ok: false, failure: { code: 'not-found', message: 'gateway said no' },
    })
    expect(await readQualifications(remote(wire))).toEqual({
      ok: false, failure: { code: 'unavailable', message: 'host gone' },
    })
  })
})

describe('saveQualifications', () => {
  it('settles the stored record', async () => {
    expect(await saveQualifications(remote(happy()), '粮油批发')).toEqual({
      ok: true, value: { text: '蔬菜配送', updatedAt: 9 },
    })
  })

  it('reports a carrier failure', async () => {
    const wire = happy()
    wire.set = { ok: false, error: carrier('timeout') }

    expect(await saveQualifications(remote(wire), 'x')).toEqual({
      ok: false, failure: { code: 'timeout', message: 'gateway said no' },
    })
  })

  it('reports the Host size refusal with both byte counts', async () => {
    const wire = happy()
    wire.set = {
      ok: true,
      value: { ok: false, error: { code: 'qualifications-too-large', maxBytes: 64, actualBytes: 90 } },
    }

    expect(await saveQualifications(remote(wire), 'x'.repeat(90))).toEqual({
      ok: false, failure: { code: 'qualifications-too-large', maxBytes: 64, actualBytes: 90 },
    })
  })
})

describe('uploadDocument', () => {
  it('stores the file and reports the server path with the picked name and size', async () => {
    const wire = happy()
    const seen: unknown[] = []
    const face = remote(wire)
    face.uploadDocument = (request) => {
      seen.push(request)
      return Promise.resolve(wire.upload)
    }

    expect(await uploadDocument(face, new File(['bid'], '标书.pdf'))).toEqual({
      ok: true, value: { filename: '标书.pdf', bytes: 3, path: '/srv/bid-documents/1f-标书.pdf' },
    })
    expect(seen[0]).toEqual({ filename: '标书.pdf', contentBase64: 'Ymlk' })
  })

  it('reports a carrier failure on the limits read before touching the file', async () => {
    const wire = happy()
    wire.limits = { ok: false, error: carrier('not-found') }

    expect(await uploadDocument(remote(wire), new File(['bid'], 'a.pdf'))).toEqual({
      ok: false, failure: { code: 'not-found', message: 'gateway said no' },
    })
  })

  it('refuses an oversized pick against the configured document limit', async () => {
    // 129 bytes against a 128-byte limit: the refusal carries the limit and the
    // observed size so the copy can name both.
    const file = new File([new Uint8Array(129)], 'big.pdf')

    expect(await uploadDocument(remote(happy()), file)).toEqual({
      ok: false, failure: { code: 'document-too-large', maxBytes: 128, actualBytes: 129 },
    })
  })

  it('accepts a file exactly at the limit', async () => {
    const file = new File([new Uint8Array(128)], 'exact.pdf')

    expect(await uploadDocument(remote(happy()), file)).toMatchObject({ ok: true })
  })

  it('reports a carrier failure on the upload call', async () => {
    const wire = happy()
    wire.upload = { ok: false, error: carrier('payload-too-large') }

    expect(await uploadDocument(remote(wire), new File(['bid'], 'a.pdf'))).toEqual({
      ok: false, failure: { code: 'payload-too-large', message: 'gateway said no' },
    })
  })

  it.each<[string, Extract<BidReviewUploadResult, { ok: false }>['error'], ReviewFailure]>([
    ['an empty name', { code: 'filename-blank' }, { code: 'filename-blank' }],
    ['an unusable name', { code: 'filename-unsafe' }, { code: 'filename-unsafe' }],
    ['undecodable content', { code: 'content-invalid' }, { code: 'content-invalid' }],
    [
      'a decoded document over the limit',
      { code: 'document-too-large', maxBytes: 128, actualBytes: 200 },
      { code: 'document-too-large', maxBytes: 128, actualBytes: 200 },
    ],
  ])('reports %s the Host refused', async (_label, error, failure) => {
    const wire = happy()
    wire.upload = { ok: true, value: { ok: false, error } }

    expect(await uploadDocument(remote(wire), new File(['bid'], 'a.pdf'))).toEqual({ ok: false, failure })
  })
})

describe('failureText', () => {
  it('names the configured limit and the observed size on both size failures', () => {
    expect(failureText(t, { code: 'qualifications-too-large', maxBytes: 65536, actualBytes: 70000 }))
      .toBe(zh['error.qualificationsTooLarge']
        .replace('{actual}', '68.4 KiB').replace('{max}', '64.0 KiB'))
    expect(failureText(t, { code: 'document-too-large', maxBytes: 100 * 1024 * 1024, actualBytes: 1 }))
      .toBe(zh['error.documentTooLarge']
        .replace('{actual}', '1 B').replace('{max}', '100.0 MiB'))
  })

  it('renders the three name-and-content refusals without a size', () => {
    expect(failureText(t, { code: 'filename-blank' })).toBe(zh['error.filenameBlank'])
    expect(failureText(t, { code: 'filename-unsafe' })).toBe(zh['error.filenameUnsafe'])
    expect(failureText(t, { code: 'content-invalid' })).toBe(zh['error.contentInvalid'])
  })

  it('renders a carrier failure with the text the gateway supplied', () => {
    expect(failureText(t, { code: 'timeout', message: 'host gone' }))
      .toBe(zh['error.generic'].replace('{detail}', 'host gone'))
  })

  it('falls back to the code when a carrier failure carries no text', () => {
    expect(failureText(t, { code: 'unknown-code' }))
      .toBe(zh['error.generic'].replace('{detail}', 'unknown-code'))
  })
})

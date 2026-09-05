// @vitest-environment jsdom
/**
 * ui-bid-review browser half on a real cordis Context with fake slots and
 * Remote faces: the plugin registers the shadowing entry at
 * conversation.composer.bar below the free-text bar's priority, the injected
 * face folds the carrier and business envelopes into one outcome per operation,
 * and the registration withdraws with the plugin fiber (HMR safety). The node
 * half is exercised over the same Context.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  BidReviewLimits, BidReviewSetQualificationsResult, BidReviewUploadResult, CompanyQualifications,
} from '@deepseek-ai/dsh-bid-review/types'
import type { BidReviewInjected } from '../src/client/slots.ts'
import { apply, inject } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'

const LIMITS: BidReviewLimits = { maxQualificationsBytes: 64, maxDocumentBytes: 128 }
const QUALIFICATIONS: CompanyQualifications = { text: '蔬菜配送', updatedAt: 7 }

/** The wire every injected operation resolves against, mutable per test. */
interface Wire {
  limits: RemoteResult<BidReviewLimits>
  qualifications: RemoteResult<CompanyQualifications>
  set: RemoteResult<BidReviewSetQualificationsResult>
  upload: RemoteResult<BidReviewUploadResult>
}

/** Boot the plugin over fake faces; the Remote namespace records every call. */
async function bench() {
  const ctx = new Context()
  const calls: { method: string; request: unknown }[] = []
  const wire: Wire = {
    limits: { ok: true, value: LIMITS },
    qualifications: { ok: true, value: QUALIFICATIONS },
    set: { ok: true, value: { ok: true, value: { text: '蔬菜配送', updatedAt: 9 } } },
    upload: { ok: true, value: { ok: true, value: { path: '/srv/bid-documents/1f-标书.pdf' } } },
  }
  const bidReview = {
    getLimits: () => {
      calls.push({ method: 'getLimits', request: undefined })
      return Promise.resolve(wire.limits)
    },
    getQualifications: () => {
      calls.push({ method: 'getQualifications', request: undefined })
      return Promise.resolve(wire.qualifications)
    },
    setQualifications: (request: { text: string }) => {
      calls.push({ method: 'setQualifications', request })
      return Promise.resolve(wire.set)
    },
    uploadDocument: (request: { filename: string; contentBase64: string }) => {
      calls.push({ method: 'uploadDocument', request })
      return Promise.resolve(wire.upload)
    },
  }
  class RemoteService extends Service {
    constructor(serviceCtx: Context) {
      super(serviceCtx, 'remote')
    }
  }
  new RemoteService(ctx)
  ctx.provide('remote.bidReview', bidReview)
  await ctx.plugin(SlotRegistry).await()
  // ui-conversation owns this declaration in the product; the bench declares the
  // same slot so the plugin's inject point resolves immediately.
  ctx.slots.register({
    name: 'root',
    children: { 'conversation.composer.bar': { kind: 'single', scope: 'session-maybe' } },
  } as never, (() => null) as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return {
    ctx,
    fiber,
    calls,
    wire,
    entry: () => {
      const entry = ctx.slots.entries('conversation.composer.bar')[0]
      if (entry === undefined) return undefined
      return { ...entry.options, locale: entry.locale, registrant: entry.registrant }
    },
    face: () => {
      const entry = ctx.slots.entries('conversation.composer.bar')[0]
      return (entry?.inject as unknown as (() => BidReviewInjected) | undefined)?.()
    },
  }
}

describe('ui-bid-review browser plugin', () => {
  it('shadows the free-text bar at a lower priority with its own copy', async () => {
    const b = await bench()

    // InputBar registers at the default 0; a single-kind cell renders its
    // lowest-priority entry, so -1 is what replaces the textarea.
    expect(b.entry()).toMatchObject({ priority: -1, locale: 'bidReview', registrant: 'ui-bid-review' })
  })

  it('injects the four bidReview operations', async () => {
    const b = await bench()

    const face = b.face()!
    for (const key of ['readLimits', 'readQualifications', 'saveQualifications', 'uploadDocument'] as const) {
      expect(typeof face[key]).toBe('function')
    }
  })

  it('routes the two reads to the Remote and settles them', async () => {
    const b = await bench()

    const face = b.face()!
    expect(await face.readLimits()).toEqual({ ok: true, value: LIMITS })
    expect(await face.readQualifications()).toEqual({ ok: true, value: QUALIFICATIONS })
    expect(b.calls.map(call => call.method)).toEqual(['getLimits', 'getQualifications'])
  })

  it('folds the carrier and business envelopes into one outcome on save', async () => {
    const b = await bench()

    const face = b.face()!
    expect(await face.saveQualifications('粮油批发')).toEqual({
      ok: true, value: { text: '蔬菜配送', updatedAt: 9 },
    })
    expect(b.calls[0]).toEqual({ method: 'setQualifications', request: { text: '粮油批发' } })

    // A Host business refusal arrives inside a successful carrier call.
    b.wire.set = {
      ok: true,
      value: { ok: false, error: { code: 'qualifications-too-large', maxBytes: 64, actualBytes: 90 } },
    }
    expect(await face.saveQualifications('x'.repeat(90))).toEqual({
      ok: false, failure: { code: 'qualifications-too-large', maxBytes: 64, actualBytes: 90 },
    })
  })

  it('uploads through the Remote and reports the stored path and picked size', async () => {
    const b = await bench()

    const face = b.face()!
    expect(await face.uploadDocument(new File(['bid'], '标书.pdf', { type: 'application/pdf' }))).toEqual({
      ok: true, value: { filename: '标书.pdf', bytes: 3, path: '/srv/bid-documents/1f-标书.pdf' },
    })
    // The upload reads the limits first so an oversized pick is refused before
    // its bytes are encoded.
    expect(b.calls.map(call => call.method)).toEqual(['getLimits', 'uploadDocument'])
    expect(b.calls[1]?.request).toMatchObject({ filename: '标书.pdf', contentBase64: 'Ymlk' })
  })

  it('withdraws the registration with the plugin fiber', async () => {
    const b = await bench()

    await b.fiber.dispose()

    expect(b.ctx.slots.entries('conversation.composer.bar')).toHaveLength(0)
  })

  it('re-registers cleanly when the plugin is reloaded', async () => {
    const b = await bench()
    await b.fiber.dispose()

    const reloaded = b.ctx.plugin({ inject: [...inject], apply })
    await reloaded.await()

    expect(b.ctx.slots.entries('conversation.composer.bar')).toHaveLength(1)
    expect(b.entry()).toMatchObject({ priority: -1 })
  })

  it('the node half applies without host-side behavior', () => {
    // The invariant companion is mounted by the vitest-wide invariant host on
    // every Context this suite creates; its registration is covered there.
    expect(() => { nodeApply() }).not.toThrow()
  })
})

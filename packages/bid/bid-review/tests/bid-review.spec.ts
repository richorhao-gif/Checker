import { readFile, readdir } from 'node:fs/promises'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { Buffer } from 'node:buffer'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import BidReviewService from '../src/index.ts'
import type { BidReviewDocument, CompanyQualifications, Config } from '../src/index.ts'
import { setupHarness, type TestHarness } from './helpers.ts'

const harnesses: TestHarness[] = []

async function harness(options: Parameters<typeof setupHarness>[0] = {}): Promise<TestHarness> {
  const value = await setupHarness(options)
  harnesses.push(value)
  return value
}

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map(value => value.dispose()))
})

function base64(content: string | Uint8Array): string {
  return Buffer.from(content).toString('base64')
}

function expectDocument(
  result: Awaited<ReturnType<BidReviewService['uploadDocument']>>,
): BidReviewDocument {
  if (!result.ok) throw new Error(`expected uploaded document, got ${result.error.code}`)
  return result.value
}

function expectQualifications(
  result: Awaited<ReturnType<BidReviewService['setQualifications']>>,
): CompanyQualifications {
  if (!result.ok) throw new Error(`expected committed qualifications, got ${result.error.code}`)
  return result.value
}

describe('BidReviewService public contract', () => {
  it('publishes the exact Gateway namespace and Remote method names', async () => {
    const { ctx } = await harness()
    const binding = ctx.bidReview.typertRemote
    expect(binding.serviceKey).toBe('bidReview')
    expect(binding.namespace).toBe('bidReview')
    expect(remoteMethods(ctx.bidReview)).toEqual([
      { method: 'getLimits', invocation: { kind: 'direct' } },
      { method: 'getQualifications', invocation: { kind: 'direct' } },
      { method: 'setQualifications', invocation: { kind: 'direct' } },
      { method: 'uploadDocument', invocation: { kind: 'direct' } },
    ])
  })

  it('serves the configured limits', async () => {
    const { ctx } = await harness({ maxQualificationsBytes: 128, maxDocumentBytes: 96 })
    await expect(ctx.bidReview.getLimits()).resolves.toEqual({
      maxQualificationsBytes: 128,
      maxDocumentBytes: 96,
    })
  })

  it('rejects a non-positive or fractional byte limit at construction', async () => {
    const invalid: Config[] = [
      { maxQualificationsBytes: 0, maxDocumentBytes: 16, uploadsRoot: 'uploads' },
      { maxQualificationsBytes: -1, maxDocumentBytes: 16, uploadsRoot: 'uploads' },
      { maxQualificationsBytes: 1.5, maxDocumentBytes: 16, uploadsRoot: 'uploads' },
      { maxQualificationsBytes: 16, maxDocumentBytes: Number.MAX_SAFE_INTEGER + 1, uploadsRoot: 'uploads' },
    ]
    for (const config of invalid) {
      const ctx = new Context()
      expect(() => new BidReviewService(ctx, config)).toThrow(TypeError)
      await ctx.fiber.dispose()
    }
  })

  it('fails every global-slot read before the domain is initialized', async () => {
    const ctx = new Context()
    const service = new BidReviewService(ctx, {
      maxQualificationsBytes: 16,
      maxDocumentBytes: 16,
      uploadsRoot: 'uploads',
    })
    await expect(service.getQualifications()).rejects.toThrow('not initialized')
    await expect(service.setQualifications({ text: '' })).rejects.toThrow('not initialized')
    await ctx.fiber.dispose()
  })
})

describe('shared company qualifications', () => {
  it('reads the never-saved record before the first write', async () => {
    const { ctx } = await harness()
    await expect(ctx.bidReview.getQualifications()).resolves.toEqual({ text: '', updatedAt: 0 })
  })

  it('stores text verbatim and stamps the save time', async () => {
    const { ctx } = await harness()
    const before = Date.now()
    const committed = expectQualifications(await ctx.bidReview.setQualifications({
      text: '  注册资本 500 万\n食品经营许可证 JY12345  ',
    }))
    expect(committed.text).toBe('  注册资本 500 万\n食品经营许可证 JY12345  ')
    expect(committed.updatedAt).toBeGreaterThanOrEqual(before)
    expect(committed.updatedAt).toBeLessThanOrEqual(Date.now())
    await expect(ctx.bidReview.getQualifications()).resolves.toEqual(committed)
  })

  it('clears the record with the empty string', async () => {
    const { ctx } = await harness()
    await ctx.bidReview.setQualifications({ text: 'qualified' })
    const cleared = expectQualifications(await ctx.bidReview.setQualifications({ text: '' }))
    expect(cleared.text).toBe('')
    expect(cleared.updatedAt).toBeGreaterThan(0)
  })

  it('rejects an oversized text with both byte counts', async () => {
    const { ctx } = await harness({ maxQualificationsBytes: 8 })
    await expect(ctx.bidReview.setQualifications({ text: '蔬菜'.repeat(3) })).resolves.toEqual({
      ok: false,
      error: { code: 'qualifications-too-large', maxBytes: 8, actualBytes: 18 },
    })
    await expect(ctx.bidReview.getQualifications()).resolves.toEqual({ text: '', updatedAt: 0 })
  })

  it('survives a service reopen over the same storage root', async () => {
    const storageRoot = await mkdtemp(join(tmpdir(), 'dsh-bid-review-reopen-'))
    try {
      const first = await setupHarness({ storageRoot })
      await first.ctx.bidReview.setQualifications({ text: 'shared across restarts' })
      await first.dispose()

      const second = await setupHarness({ storageRoot })
      harnesses.push(second)
      const reopened = await second.ctx.bidReview.getQualifications()
      expect(reopened.text).toBe('shared across restarts')
      expect(reopened.updatedAt).toBeGreaterThan(0)
    } finally {
      await rm(storageRoot, { recursive: true, force: true })
    }
  })
})

describe('bid document upload', () => {
  it('lands decoded bytes under a UUID-prefixed sanitized name', async () => {
    const { ctx, uploadsRoot } = await harness()
    const content = Buffer.from('%PDF-1.7 标书正文\n', 'utf8')
    const document = expectDocument(await ctx.bidReview.uploadDocument({
      filename: '食堂蔬菜采购标书.pdf',
      contentBase64: content.toString('base64'),
    }))
    expect(isAbsolute(document.path)).toBe(true)
    expect(document.path).toBe(join(uploadsRoot, document.path.split(/[\\/]/).pop() ?? ''))
    const storedName = document.path.split(/[\\/]/).pop() ?? ''
    expect(storedName).toMatch(/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}-食堂蔬菜采购标书\.pdf$/)
    expect(await readFile(document.path)).toEqual(content)
    expect(await readdir(uploadsRoot)).toEqual([storedName])
  })

  it('reuses one upload directory across concurrent uploads', async () => {
    const { ctx, uploadsRoot } = await harness()
    const [first, second] = await Promise.all([
      ctx.bidReview.uploadDocument({ filename: 'a.txt', contentBase64: base64('A') }),
      ctx.bidReview.uploadDocument({ filename: 'b.txt', contentBase64: base64('B') }),
    ])
    const paths = [expectDocument(first).path, expectDocument(second).path]
    expect(new Set(paths).size).toBe(2)
    expect((await readdir(uploadsRoot)).length).toBe(2)
  })

  it('drops path segments and forbidden characters from the supplied name', async () => {
    const { ctx } = await harness()
    const traversal = expectDocument(await ctx.bidReview.uploadDocument({
      filename: '..\\..\\windows/system<>:"|?*.exe',
      contentBase64: base64('x'),
    }))
    expect(traversal.path.endsWith('-system_______.exe')).toBe(true)

    const control = expectDocument(await ctx.bidReview.uploadDocument({
      filename: 'bid\u0000\u0001.txt',
      contentBase64: base64('x'),
    }))
    expect(control.path.endsWith('-bid__.txt')).toBe(true)

    const trailing = expectDocument(await ctx.bidReview.uploadDocument({
      filename: 'report. . .',
      contentBase64: base64('x'),
    }))
    expect(trailing.path.endsWith('-report')).toBe(true)

    const directory = expectDocument(await ctx.bidReview.uploadDocument({
      filename: 'dir/',
      contentBase64: base64('x'),
    }))
    expect(directory.path.endsWith('-dir')).toBe(true)

    const long = expectDocument(await ctx.bidReview.uploadDocument({
      filename: `${'a'.repeat(250)}.pdf`,
      contentBase64: base64('x'),
    }))
    const longName = long.path.split(/[\\/]/).pop() ?? ''
    expect(longName.length).toBe(36 + 1 + 200)
    expect(longName.endsWith('a')).toBe(true)
  })

  it('rejects a filename with no usable character', async () => {
    const { ctx } = await harness()
    const cases = [['', 'filename-blank'], ['   ', 'filename-blank'], ['...', 'filename-unsafe']] as const
    for (const [filename, code] of cases) {
      await expect(ctx.bidReview.uploadDocument({ filename, contentBase64: base64('x') }))
        .resolves.toEqual({ ok: false, error: { code } })
    }
  })

  it('measures the size limit on decoded bytes', async () => {
    const { ctx } = await harness({ maxDocumentBytes: 8 })
    const content = Buffer.alloc(9, 0x61)
    await expect(ctx.bidReview.uploadDocument({
      filename: 'nine.txt',
      contentBase64: content.toString('base64'),
    })).resolves.toEqual({
      ok: false,
      error: { code: 'document-too-large', maxBytes: 8, actualBytes: 9 },
    })
    const eight = expectDocument(await ctx.bidReview.uploadDocument({
      filename: 'eight.txt',
      contentBase64: Buffer.alloc(8, 0x62).toString('base64'),
    }))
    expect((await readFile(eight.path)).byteLength).toBe(8)
  })

  it('rejects content that is not canonical base64 and tolerates line breaks', async () => {
    const { ctx } = await harness()
    for (const contentBase64 of ['not base64 !!!', '====', 'YQ==extra', 'a']) {
      await expect(ctx.bidReview.uploadDocument({ filename: 'x.txt', contentBase64 }))
        .resolves.toEqual({ ok: false, error: { code: 'content-invalid' } })
    }
    const wrapped = expectDocument(await ctx.bidReview.uploadDocument({
      filename: 'wrapped.txt',
      contentBase64: base64('hello world').replace(/(.{4})/g, '$1\n'),
    }))
    expect((await readFile(wrapped.path)).toString('utf8')).toBe('hello world')
  })
})

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import BidReviewService from '../src/index.ts'

export interface HarnessOptions {
  readonly maxQualificationsBytes?: number
  readonly maxDocumentBytes?: number
  /** Existing storage root to reopen; a fresh temp dir when omitted. */
  readonly storageRoot?: string
  /** Existing upload dir; a fresh subdir of the storage root when omitted. */
  readonly uploadsRoot?: string
}

export interface TestHarness {
  readonly ctx: Context
  readonly storageRoot: string
  readonly uploadsRoot: string
  dispose(): Promise<void>
}

/** Compose the service over the real storage hub/domain/JSON backend. */
export async function setupHarness(options: HarnessOptions = {}): Promise<TestHarness> {
  const ownsRoot = options.storageRoot === undefined
  const storageRoot = options.storageRoot ?? await mkdtemp(join(tmpdir(), 'dsh-bid-review-test-'))
  const uploadsRoot = options.uploadsRoot ?? join(storageRoot, 'uploads')
  const ctx = new Context()
  try {
    await ctx.plugin(Storage)
    await ctx.plugin(StorageJson, { root: join(storageRoot, 'storages') })
    await ctx.plugin(StorageDomain, { backend: 'json' })
    await ctx.plugin(BidReviewService, {
      maxQualificationsBytes: options.maxQualificationsBytes ?? 64,
      maxDocumentBytes: options.maxDocumentBytes ?? 4096,
      uploadsRoot,
    })
  } catch (error) {
    await ctx.fiber.dispose()
    if (ownsRoot) await rm(storageRoot, { recursive: true, force: true })
    throw error
  }
  return {
    ctx,
    storageRoot,
    uploadsRoot,
    async dispose() {
      await ctx.fiber.dispose()
      if (ownsRoot) await rm(storageRoot, { recursive: true, force: true })
    },
  }
}

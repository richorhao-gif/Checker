import { describe, expect, it } from 'vitest'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as BidReviewInvariant from '../src/invariant.ts'
import { setupHarness } from './helpers.ts'

describe('bid-review invariant companion', () => {
  it('removes its registry contribution when its fiber is disposed (HMR safety)', async () => {
    const harness = await setupHarness()
    try {
      await harness.ctx.plugin(InvariantRegistry)
      const fiber = await harness.ctx.plugin(BidReviewInvariant)

      expect(() => {
        harness.ctx.invariants.register('@deepseek-ai/dsh-bid-review', () => {})
      }).toThrow(/already registered/u)

      await fiber.dispose()
      await expect(harness.ctx.plugin(BidReviewInvariant).await()).resolves.toBeDefined()
    } finally {
      await harness.dispose()
    }
  })
})

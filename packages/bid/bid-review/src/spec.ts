/**
 * Durable storage-domain declaration for the shared company qualifications.
 * @module @deepseek-ai/dsh-bid-review/src/spec
 */

import { z } from 'zod'
import { defineDomain } from '@deepseek-ai/dsh-storage-domain'

const nonNegativeSafeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

/** Runtime schema for the one shared qualifications record. */
export const bidReviewQualificationsSchema = z.object({
  text: z.string(),
  updatedAt: nonNegativeSafeInteger,
})

/** Stored qualifications record inferred from {@link bidReviewQualificationsSchema}. */
export type BidReviewQualificationsRecord = z.infer<typeof bidReviewQualificationsSchema>

/**
 * The bid-review domain: one global slot holding the company-wide
 * qualifications text. `updatedAt: 0` marks the never-saved initial record,
 * which the medium materializes only at the first `set`.
 */
export const bidReviewDomainSpec = defineDomain({
  name: 'bid_review',
  version: 0,
  global: {
    schema: bidReviewQualificationsSchema,
    initial: { text: '', updatedAt: 0 },
  },
  tables: {},
})
